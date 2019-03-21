<?php

namespace App\Http\Controllers;

use App\DailySale;
use App\Http\UserService;
use Illuminate\Http\Request;
use App\Http\SalesPairingsService;
use App\Http\Resources\ApiResource;
use Illuminate\Support\Facades\Auth;
use App\Http\Services\PayrollDetailsService;
use App\Http\Helpers;
use Symfony\Component\Process\Process;
use Illuminate\Support\Facades\URL;
use Carbon\Carbon;
use Symfony\Component\Process\Exception\ProcessFailedException;

class PayrollDetailController extends Controller
{
    protected $service;
    protected $userService;
    protected $salesPairingsService;
    protected $helper;

    public function __construct(PayrollDetailsService $_service, UserService $_userService, 
        SalesPairingsService $_salesPairingsService, Helpers $_helpers) {
        $this->service = $_service;
        $this->userService = $_userService;
        $this->salesPairingsService = $_salesPairingsService;
        $this->helper = $_helpers;
    }

    public function getPaychecks(Request $request, $clientId)
    {
        $result = new ApiResource();

        $result
			->checkAccessByClient($clientId, Auth::user()->id)
			->mergeInto($result);

		if($result->hasError)
			return $result->throwApiException()->getResponse();

        $this->service->getPaychecksPaged($request, $clientId)->mergeInto($result);

        return $result->throwApiException()->getResponse();
    }

    /**
     * This is the API endpoint that handles executing the node script and creating the PDF stub.
     *
     * @param [type] $clientId
     * @return void
     */
    public function runHeadlessDetailScript($clientId, $payrollDetailsId)
    {
        $result = new ApiResource();
        $userId = Auth::user()->id;

        $result
            ->checkAccessByClient($clientId, $userId)
            ->mergeInto($result);

        if($result->hasError)
            return $result->throwApiException()->getResponse();

        $url = URL::to('/#/admin/pay/paycheck-detail/&client=') . $clientId 
            . '&user=' . $userId 
            . '&detail=' . $payrollDetailsId
            . '&headless=' . env('HEADLESS');
        
        $process = new Process(['node', './storage/scripts/pdf.js', 
            $url, $clientId, $userId, Carbon::now()->format('Y-m-d')
        ]);

        $process->run();

        if(!$process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }

        /**
         * 
         * NEED TO THEN GET FILE FROM FILESYSTEM AND RETURN IT TO THE FRONTEND... 
         * 
         */

        return $result->setToSuccess()
            ->throwApiException()
            ->getResponse();
    }

    public function getHeadlessPaycheckDetail($clientId, $userId, $payrollDetailId, $headless)
    {
        $result = new ApiResource();

        $result
            ->checkAccessByClient($clientId, $userId)
            ->mergeInto($result);

        if($result->hasError)
            return $result->throwApiException()->getResponse();

        $envHead = env('HEADLESS');

        if($envHead != $headless)
            return $result->setToFail()->throwApiException()->getResponse();

        $detail = $this->service->getPaycheck($payrollDetailId)->getData();
        $user = $this->userService->getUserDtoByUser($userId);
        $sales = DailySale::with(['agent', 'campaign', 'saleStatus'])->byClient($clientId)
            ->filterPaid()
            ->byDateRange($detail['payroll']['payCycle']['startDate'], $detail['payroll']['payCycle']['endDate'])
            ->get();
        $sales = $this->helper->normalizeLaravelObject($sales->toArray());
        $pairings = $this->salesPairingsService->getSalesPairingsByClientId($clientId)->getData();

        $payload = ['detail' => $detail, 'user' => $user, 'sales' => $sales, 'pairings' => $pairings];

        return $result->setData($payload)
            ->throwApiException()->getResponse();
    }

}
