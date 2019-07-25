import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import { Observable, Subject, ReplaySubject } from 'rxjs';
import { PayCycle } from '@app/models/pay-cycle.model';
import { environment } from '@env/environment';
import { DailySale } from '@app/models';

@Injectable({
    providedIn: 'root'
})
export class PayCycleService {

    private readonly api = environment.apiUrl;

    private _cycle:PayCycle;
    cycle$:Subject<PayCycle> = new Subject<PayCycle>();

    constructor(private http: HttpClient) {}

    /** HTTP CALLS */

    getPayCycles(clientId:number, includeClosed = false):Observable<PayCycle[]> {
        return this.http.get<PayCycle[]>(`${this.api}api/clients/${clientId}/pay-cycles/include-closed/${includeClosed}`);
    }

    // clients/{clientId}/pay-cycles/{payCycleId}/existing-pay-cycle-affiliates
    checkAndOpenSoftDeletedPayCycleAffiliates(clientId:number, payCycleId:number):Observable<boolean> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/${payCycleId}/existing-pay-cycle-affiliates`;
        return this.http.get<boolean>(url);
    }

    getSalesByDateRange(clientId:number, start:string, end:string, includeClosed = false):Observable<DailySale[]> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/daily-sales`;
        return this.http.get<DailySale[]>(url, { 
            params: new HttpParams({
                fromObject: {
                    start: start,
                    end: end,
                    includeClosed: includeClosed.toString()
                }
            })
        });
    }

    getPayCycleSales(clientId:number, start:string, end:string, payCycleId:number = null):Observable<DailySale[]> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/${payCycleId}`;
        return this.http.get<DailySale[]>(url, {
            params: new HttpParams({
                fromObject: {
                    start: start,
                    end: end
                }
            })
        });
    }

    /**
     * System admin action only, this removes payrolls if someone processed payroll when they shouldn't have.
     * 
     * @param client 
     * @param payCycleId 
     */
    deletePayCyclePayrolls(clientId:number, payCycleId:number, payrollIds:string[]):Observable<boolean> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/${payCycleId}/payrolls`;
        let params = new HttpParams();

        payrollIds.forEach(p => {
            params = params.append('ids[]', p);
        });
        
        return this.http.delete<boolean>(url, { params: params });
    }

    updatePayCycle(clientId:number, payCycleId:number, dto:PayCycle):Observable<PayCycle> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/${payCycleId}`;
        return this.http.post<PayCycle>(url, {
            cycle: dto
        });
    }

    updateDailySaleWithPayCycle(clientId:number, payCycleId:number, sales:DailySale[]):Observable<DailySale[]> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/${payCycleId}/sales`;
        return this.http.post<DailySale[]>(url, {
            sales: sales
        });
    }

    getLastPayCycle(clientId:number):Observable<PayCycle> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles/last`;
        return this.http.get<PayCycle>(url);
    }

    savePayCycle(clientId:number, dto:PayCycle):Observable<PayCycle> {
        const url = `${this.api}api/clients/${clientId}/pay-cycles`;
        return this.http.post<PayCycle>(url, dto);
    }

    /** INTERNAL API CALLS */

    /** GETTER & SETTERS */

    get cycle():PayCycle {
        return this._cycle;
    }
    set cycle(value:PayCycle) {
        this._cycle = value;
        this.cycle$.next(this._cycle);
    }

}
