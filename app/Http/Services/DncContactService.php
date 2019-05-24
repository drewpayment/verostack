<?php

namespace App\Http\Services;

use App\DncContact;
use Illuminate\Support\Facades\DB;
use App\Http\Resources\ApiResource;
use App\Contact;

class DncContactService 
{
	protected $clientService;

	public function __construct(ClientService $_clientService)
	{
		$this->clientService = $_clientService;
	}

	/**
	 * Undocumented function
	 *
	 * @param Illuminate\Http\Request $model
	 * @return App\Http\Resources\ApiResource
	 */
	public function saveNewDncContact($model) 
	{
		$result = new ApiResource();

		$c = new DncContact([
			'dnc_contact_id' => $model->dncContactId,
			'client_id' => $model->clientId,
			'first_name' => $model->firstName,
			'last_name' => $model->lastName,
			'description' => $model->description,
			'address' => $model->address,
			'address_cont' => $model->addressCont,
			'city' => $model->city,
			'state' => $model->state,
			'zip' => $model->zip,
			'note' => $model->note
		]);

		$saved = $c->save();

		if (!$saved) return $result->setToFail();

		return $result->setData($c);
	}

	/**
	 * Delete a single or list or DncContact entities from system.
	 *
	 * @param int[] $dncContactIds
	 * @return App\Http\Resources\ApiResource
	 */
	public function deleteDncContacts($dncContactIds)
	{
		$result = new ApiResource();

		DB::beginTransaction();
        try {
            $deletedDncContacts = DncContact::byDncContactList($dncContactIds)->delete();
            DB::commit();

            $result->setData($deletedDncContacts);
        } catch (\Exception $e) {
            DB::rollBack();

            $result->setToFail();
		}
		
		return $result;
	}

	/**
	 * Checks if the user's selected client has enabled the mobile feature to use existing contacts
	 * from the normal contact db as dnc contacts. 
	 *
	 * @param int $clientId
	 * @return ApiResource
	 */
	public function getExistingContacts($clientId)
	{
		$result = new ApiResource();

		$this->clientService->getClientOptions($clientId)->mergeInto($result);

		$options = $result->getData();
		if (is_null($options) || !$options['useExistingContacts']) {
			return $result;
		}

		$contacts = Contact::all();

		$result->setData($contacts);

		return $result;
	}

}