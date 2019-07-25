import {Component, OnInit, AfterViewInit, OnDestroy} from '@angular/core';
import { User, ICampaign, PayrollDetails, Payroll } from '@app/models';
import { SessionService } from '@app/session.service';
import { MatDialog } from '@angular/material';
import { CampaignService } from '@app/campaigns/campaign.service';
import { MessageService } from '@app/message.service';
import { PayCycle } from '@app/models/pay-cycle.model';
import { Router } from '@angular/router';
import { BehaviorSubject, forkJoin, Subscription } from 'rxjs';
import { PayCycleDialogComponent } from './components/pay-cycle-dialog/pay-cycle-dialog.component';
import { Moment } from 'moment';
import * as moment from 'moment';
import { map, share, shareReplay } from 'rxjs/operators';
import { PayrollService } from '@app/payroll/payroll.service';
import { PayCycleService } from './pay-cycle.service';
import { CdkDragDrop, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { AgentService } from '@app/agent/agent.service';
import { ISalesPairing } from '@app/models/sales-pairings.model';
import { PayCycleTutorialDialogComponent } from './components/pay-cycle-tutorial-dialog/pay-cycle-tutorial-dialog.component';

enum DropListType {
    Todo,
    Locked,
    Closed
}

@Component({
    selector: 'vs-pay-cycle',
    templateUrl: './pay-cycle.component.html',
    styleUrls: ['./pay-cycle.component.scss']
})
export class PayCycleComponent implements OnInit, AfterViewInit, OnDestroy {

    today:Moment = moment();
    user:User;
    campaigns:ICampaign[];
    private _cycles:PayCycle[];
    displayCycles:BehaviorSubject<PayCycle[]> = new BehaviorSubject<PayCycle[]>([]);
    showClosed = false;

    todoCycles:PayCycle[];
    lockedCycles:PayCycle[];
    closedCycles:PayCycle[];

    salesPairings:ISalesPairing[];

    private pageLoadSubscription:Subscription;

    constructor(
        private session:SessionService,
        private agentService:AgentService,
        private payCycleService:PayCycleService,
        private payrollService:PayrollService,
        private dialog:MatDialog,
        private campaignService:CampaignService,
        private msg:MessageService,
        private router:Router
    ) {}

    ngOnInit() {
        this.session.showLoader();
    }

    ngAfterViewInit() {
        this.session.getUserItem()
            .pipe(share())
            .subscribe(u => {
                if (u == null) return;
                this.user = u;
                const clientId = this.user.sessionUser.sessionClient;

                this.pageLoadSubscription = forkJoin(
                    this.campaignService.getCampaignsByClient(clientId).pipe(share()),
                    this.payCycleService.getPayCycles(clientId).pipe(share()),
                    this.agentService.getSalesPairingsByClient(clientId).pipe(share())
                )
                .subscribe(([campaigns, cycles, pairings]) => {
                    this.campaigns = campaigns;
                    this._cycles = cycles;
                    this.salesPairings = pairings;

                    this._filterCycles();
                    this.session.hideLoader();
                });
            });
    }

    ngOnDestroy() {
        this.pageLoadSubscription.unsubscribe();
    }

    drop(event:CdkDragDrop<PayCycle[]>, type:DropListType) {

        /** Simply reorganizing the list... we don't support manual ordering right now */
        if (event.previousContainer === event.container) {
            moveItemInArray<PayCycle>(event.container.data, event.previousIndex, event.currentIndex);
        } else {
            this.session.showLoader();

            transferArrayItem<PayCycle>(event.previousContainer.data,
                event.container.data,
                event.previousIndex,
                event.currentIndex);

            const cycle = event.container.data[event.currentIndex];

            if (type == DropListType.Todo) {
                cycle.isPending = true;
                cycle.isLocked = false;
                cycle.isClosed = false;
            } else if (type == DropListType.Locked) {
                cycle.isLocked = true;
                cycle.isClosed = false;
            } else if (type == DropListType.Closed) {
                cycle.isPending = false;
                cycle.isLocked = false;
                cycle.isClosed = true;
            }

            this.payCycleService.updatePayCycle(this.user.sessionUser.sessionClient, cycle.payCycleId, cycle)
                .subscribe(result => {
                    this._cycles.forEach((c, i, a) => {
                        if (c.payCycleId != result.payCycleId) return;
                        a[i] = result;
                    });

                    this.session.hideLoader();

                    /** This will run logic to make available in paycheck list */
                    // if (type == DropListType.Locked) this.processPayroll(result); // commented for now, changed to manual process button
                });
        }
    }

    private _filterCycles() {
        this.todoCycles = this._cycles.filter(c => !c.isClosed && !c.isLocked)
            .sort((a, b) => <any>new Date(<any>b.startDate) - <any>new Date(<any>a.startDate));
        this.lockedCycles = this._cycles.filter(c => !c.isClosed && c.isLocked)
            .sort((a, b) => <any>new Date(<any>b.startDate) - <any>new Date(<any>a.startDate));
        this.closedCycles = this._cycles.filter(c => c.isClosed)
            .sort((a, b) => <any>new Date(<any>b.startDate) - <any>new Date(<any>a.startDate));

        if (!this.todoCycles.length && !this.lockedCycles.length && !this.closedCycles.length) {
            this.dialog.open(PayCycleTutorialDialogComponent, {
                width: '50vw'
            })
            .afterClosed()
            .subscribe((result) => {

            });
        }
    }

    getHumanReadableDuration(cycle:PayCycle):string {
        return this.today.to(cycle.createdAt);
    }

    addPayCycle() {
        this.dialog.open(PayCycleDialogComponent, {
            width: '50vw'
        })
        .afterClosed()
        .subscribe((result:PayCycle) => {
            if (result == null) return;

            this.payCycleService.savePayCycle(this.user.sessionUser.sessionClient, result)
                .subscribe(cycle => {
                    this.msg.addMessage('Successfully created pay cycle!', 'dismiss', 5000);
                    this._cycles.push(cycle);
                    this.displayCycles.next(this._cycles);

                    this._filterCycles();
                });
        });
    }

    getPayrollEditDate(cycle:PayCycle) {
        return cycle.payrolls[0].updatedAt;
    }

    getBorderColor(cycle:PayCycle, borderDirection:string = 'left') {
        if(this.isPayCycleDue(cycle))
            return `${borderDirection}-border-danger`;
        return cycle != null && cycle.payrolls != null && cycle.payrolls.length > 0 
            ? `${borderDirection}-border-success`
            : `${borderDirection}-border-primary`;
    }

    getButtonColor(cycle:PayCycle) {
        return !(cycle != null && cycle.payrolls != null && cycle.payrolls.length > 0 )
            ? 'primary'
            : '';
    }

    getEditButtonColor(cycle:PayCycle) {
        return cycle != null && cycle.payrolls != null && cycle.payrolls.length > 0
            ? ''
            : 'primary';
    }

    private getActive():void {
        // this.displayCycles.next(this._cycles.filter(c => !c.isClosed));
    }

    private getArchived():void {
        this.displayCycles.next(this._cycles.filter(c => c.isClosed));
    }

    getCycleStatus(cycle:PayCycle):string {
        let message = '';

        if (cycle.payrolls != null && cycle.payrolls.length > 0)
            return 'Complete. Ready to release.';

        if (moment(cycle.endDate).isSameOrBefore(moment(), 'day'))
            return 'Due for release.';

        if (!cycle.isPending && !cycle.isClosed) {
            message = 'Get started.';
        } else if (cycle.isPending && !cycle.isClosed) {
            message = 'Pending.';
        } else if (cycle.isClosed) {
            message = 'Closed with no sales.';
        }
        return message;
    }

    isPayCycleDue(cycle:PayCycle):boolean {
        return moment(cycle.endDate).isSameOrBefore(moment(), 'days')
            && (cycle.payrolls == null || cycle.payrolls.length == 0);
    }

    editPayCycle(cycle:PayCycle):void {
        this.payCycleService.cycle = cycle;
        this.router.navigate(['admin/pay/pay-cycles/edit', cycle.payCycleId]);
    }

    closePayCycle(cycle:PayCycle):void {
        this.session.showLoader();

        cycle.isPending = false;
        cycle.isClosed = true;

        this.updatePayCycle(cycle);
    }

    openPayCycle(cycle:PayCycle):void {
        this.session.showLoader();

        cycle.isPending = true;
        cycle.isClosed = false;

        this.updatePayCycle(cycle);
    }

    isBeforeEndDate(cycle:PayCycle):boolean {
        return moment(cycle.endDate).isBefore(this.today);
    }

    reopenPayroll(cycle:PayCycle):void {
        cycle.isClosed = false;

        const payrollIds = cycle.payrolls == null ? [] : cycle.payrolls.map(p => p.payrollId.toString());
        this.payCycleService.deletePayCyclePayrolls(this.user.sessionUser.sessionClient, cycle.payCycleId, payrollIds)
            .subscribe(result => {
                if (!result) {
                    this.msg.addMessage(`
                        Sorry, we were unable to remove the payrolls. You need to delete payrolls associated with 
                        PayCycleId --> ${cycle.payCycleId}
                    `, 'dismiss');
                }

                this.updatePayCycle(cycle);
            });
    }

    /**
     * Begins the workflow of processing payroll. Opens the dialog to allow user to select a "pay date" 
     * and then creates the relationship to the this cycle, calculates total information for users, 
     * and finally closes the cycle.
     * 
     * @param cycle 
     */
    processPayroll(cycle:PayCycle) {

        /** CHECK FOR SOFT DELETED PAYROLL AND PAYROLL DETAILS */
        this.payCycleService.checkAndOpenSoftDeletedPayCycleAffiliates(
            this.user.sessionUser.sessionClient,
            cycle.payCycleId
        ).subscribe(result => {

            if (result) {
                cycle.isClosed = true;
                this.updatePayCycle(cycle);
            } else {
                this.createPayrollsByCampaign(cycle);
            }
        });
    }

    private createPayrollsByCampaign(cycle:PayCycle) {
        this.payCycleService.getPayCycleSales(
            this.user.sessionUser.sessionClient, 
            cycle.startDate as string, 
            cycle.endDate as string, 
            cycle.payCycleId
            ).pipe(
                map(sales => {
                    const campaigns = sales.map(s => s.campaignId).filter((s, i, a) => a.indexOf(s) === i);
                    const payrollResults:Payroll[] = [];

                    campaigns.forEach(c => {
                        const campaign = this.campaigns.find(camp => camp.campaignId === c);
                        const filteredSales = sales.filter(s => s.campaignId == c);
                        const payroll:Payroll = {
                            payrollId: null,
                            payCycleId: cycle.payCycleId,
                            campaignId: c,
                            utilityId: 0,
                            weekEnding: cycle.endDate,
                            isAutomated: false,
                            isReleased: false,
                            details: <PayrollDetails[]>[]
                        };
                        
                        const uniqueAgents = filteredSales.map(fs => fs.agentId).filter((fs, i, a) => a.indexOf(fs) === i);
                        
                        uniqueAgents.forEach(ua => {
                            const pairing = this.salesPairings.find(sp => sp.campaignId == c && sp.agentId == ua);
                            const commission = pairing != null ? pairing.commission : null;
                            const agentSales = filteredSales.filter(fs => fs.agentId == ua && fs.payCycleId == cycle.payCycleId);
                            const grossTotal = agentSales.length * (commission || campaign.compensation || 0);

                            /** 
                             * TODO:
                             * how do we figure this out? this might need to be a server side calc if 
                             * the company has "taxes" turned on? 
                             */
                            const taxes = 0;
                            const netTotal = grossTotal - taxes;

                            /** push our payroll detail to the details property on the current payroll we're creating */
                            payroll.details.push({
                                payrollDetailsId: null,
                                payrollId: null,
                                agentId: ua,
                                sales: agentSales.length,
                                grossTotal: grossTotal,
                                taxes: taxes,
                                netTotal: netTotal,
                                modifiedBy: this.user.id,
                                createdAt: moment(),
                                updatedAt: moment()
                            });
                        });

                        payrollResults.push(payroll);
                    });

                    return payrollResults;
                })
            )
            .subscribe(sales => {
                this.payrollService.savePayrollList(this.user.sessionUser.sessionClient, sales)
                    .subscribe(payrolls => {
                        this.msg.addMessage('Successfully processed payroll.', 'dismiss', 2500);
                        
                        if (cycle.payrolls != null && cycle.payrolls.length)
                            cycle.payrolls.concat(payrolls);
                        else 
                            cycle.payrolls = payrolls;

                        // if we get here, we've successfully process payroll,
                        // now we are going to close the pay cycle
                        cycle.isClosed = true;
                        this.updatePayCycle(cycle);
                    });
            });
    }

    private updatePayCycle(cycle:PayCycle):void {
        this.payCycleService.updatePayCycle(this.user.sessionUser.sessionClient, cycle.payCycleId, cycle)
            .subscribe(payCycle => {
                this.session.hideLoader();
                this._cycles.forEach((c, i, a) => {
                    if (payCycle.payCycleId != c.payCycleId) return;
                    a[i] = payCycle;
                });

                this._filterCycles();
            });
    }

    switchDisplay():void {
        this.showClosed = !this.showClosed;
        if (this.showClosed)
            this.getArchived();
        else
            this.getActive();
    }
}
