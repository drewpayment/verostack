import {Component, OnInit, ViewChild} from '@angular/core';
import { Payroll, User, PayrollFilter, IAgent, ICampaign, PayrollFilterType, PayrollDetails } from '@app/models';
import { BehaviorSubject } from 'rxjs';
import { MessageService } from '@app/message.service';
import { PayrollService } from '../payroll.service';
import { SessionService } from '@app/session.service';
import { MatDialog, MatTable, MatTableDataSource, MatDatepicker, MatDatepickerInputEvent, MatCheckboxChange } from '@angular/material';
import { PayrollFilterDialogComponent } from '../payroll-filter-dialog/payroll-filter-dialog.component';
import { Moment, MomentInclusivity } from '@app/shared/moment-extensions';
import * as moment from 'moment';
import { CampaignService } from '@app/campaigns/campaign.service';
import { trigger, state, style, transition, animate, sequence, query } from '@angular/animations';
import { SelectionModel } from '@angular/cdk/collections';
import { OverrideExpenseDialogComponent } from '../override-expense-dialog/override-expense-dialog.component';
import { ScheduleAutoReleaseDialogComponent } from '../schedule-auto-release-dialog/schedule-auto-release-dialog.component';
import { ConfirmAutoreleaseDateDialogComponent } from '../confirm-autorelease-date-dialog/confirm-autorelease-date-dialog.component';
import { ConfirmReleaseDialogComponent } from '../confirm-release-dialog/confirm-release-dialog.component';
import * as _ from 'lodash';
import { isArray } from 'util';

@Component({
    selector: 'vs-payroll-list',
    templateUrl: './payroll-list.component.html',
    styleUrls: ['./payroll-list.component.scss'],
    animations: [
        trigger('detailExpand', [
            state('collapsed', style({height: '0px', minHeight: '0', display: 'none'})),
            state('expanded', style({height: '*'})),
            transition('collapsed => expanded', [
                sequence([
                    animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'),
                    query('.detail-mat-cell', [
                        style({ height: '*' })
                    ])
                ])
            ]),
            transition('expanded => collapsed', [
                sequence([
                    query('.detail-mat-cell', [
                        style({ height: '0px', minHeight: '0', display: 'none' })
                    ]),
                    animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')
                ])
            ])
        ]),
        trigger('collapseIcon', [
            state('collapsed', style({ transform: 'rotate(0)' })),
            state('expanded', style({ transform: 'rotate(180deg)' })),
            transition('collapsed <=> expanded', animate('400ms ease-in-out'))
        ])
    ]
})
export class PayrollListComponent implements OnInit {

    user:User;
    private _payrolls:Payroll[];
    payrolls$ = new BehaviorSubject<Payroll[]>(null);
    agents:IAgent[];
    campaigns:ICampaign[];
    defaultEndDate:Moment;
    defaultStartDate:Moment;
    filters:PayrollFilter = { 
        activeFilters: [],
        startDate: null,
        endDate: null
    } as PayrollFilter;
    private _isFilterBtnActive = false;
    isFilterBtnActive$ = new BehaviorSubject<boolean>(this._isFilterBtnActive);
    filteredAgent:IAgent;
    displayingResults:string;

    displayColumns = [
        'selected', 'campaign', 'cycleStart', 'cycleEnd', 'isAutomated', 
        'isReleased', 'automatedRelease', 'status', 'collapsedState'
    ];
    detailColumns = ['agent', 'sales', 'gross', 'taxes', 'net'];
    expandedItem:Payroll;
    initialSelection = [];
    allowMultiSelect = true;
    selection = new SelectionModel<Payroll>(true, []);
    @ViewChild('tableRef') table:MatTable<MatTableDataSource<Payroll>>; 
    disableRelease = true;

    selectedAutoReleaseDate:Moment;

    constructor(
        private msg:MessageService,
        private service:PayrollService,
        private session:SessionService,
        private campaignService:CampaignService,
        private dialog:MatDialog
    ) {}

    ngOnInit() {
        this.session.showLoader();
        this.session.getUserItem().subscribe(user => {
            this.user = user;
            this.populateCampaigns();
            this.initializeComponent();
        });

        this.selection.onChange.subscribe(() => this.disableRelease = this.selection.selected.length == 0);
    }

    /**
     * How we manage to update our payrolls and keep track of everything happening in one method to 
     * the updated list of payrolls.
     * 
     * @param payrolls 
     */
    private setPayrolls(payrolls:Payroll[]):void {
        this._payrolls = payrolls;
        this.payrolls$.next(this._payrolls);
    }

    /**
     * Handles when the user changes the hidden datepicker value on the template that sets the auto-release 
     * date. 
     * 
     * @param event 
     */
    dateChanged(event:MatDatepickerInputEvent<Moment>) {
        this.selectedAutoReleaseDate = event.value;

        this.dialog.open(ConfirmAutoreleaseDateDialogComponent, {
            width: '30vw',
            data: {
                date: this.selectedAutoReleaseDate
            }
        })
        .afterClosed()
        .subscribe(result => {
            if (result == null) return;

            const payrollIds = this.selection.selected.map(p => p.payrollId);

            this.service.saveAutoReleaseSettings(this.user.sessionUser.sessionClient, payrollIds, result)
                .subscribe(payrolls => {
                    // TODO: Do we really need to do this? Can't we just pass "payrolls" return from the API into setPayrolls()?
                    payrolls.forEach(p => {
                        this._payrolls.forEach((pp, i, a) => {
                            if (pp.payrollId == p.payrollId) 
                                a[i] = p;
                        });
                    });
                    
                    this.setPayrolls(this._payrolls);
                });
        });
    }

    /**
     * If the payroll has been scheduled for autorelease and the release hasn't happened, 
     * the user can uncheck the autorelease option and it will remove the autorelease settings.
     * 
     * @param event 
     * @param item 
     */
    removeAutoRelease(event:MatCheckboxChange, item:Payroll) {
        this.service.removeAutoReleaseSettings(this.user.sessionUser.sessionClient, item.payrollId)
            .subscribe(result => {
                this._payrolls.forEach((p, i, a) => {
                    if (p.payrollId != result.payrollId) return;
                    a[i] = result;
                });
                this.setPayrolls(this._payrolls);
            });
    }

    filterBtnClick() {
        this.dialog.open(PayrollFilterDialogComponent, {
                width: '40vw',
                data: {
                    filters: this.filters,
                    agents: this.agents,
                    campaigns: this.campaigns
                }
            })
            .afterClosed()
            .subscribe(result => {
                if (result == null) return;
                this.filters = result;
                this.setActiveFiltersStatus();    
                this.applyFilters();            
            });
    }

    getFilteredAgent(agentId:number):IAgent {
        if (this.agents == null || !this.agents.length) return {};
        return this.agents.find(a => a.agentId == agentId);
    }

    getFilteredCampaign(campaignId:number):ICampaign {
        if (this.campaigns == null || !this.campaigns.length) return {} as ICampaign;
        return this.campaigns.find(c => c.campaignId == campaignId);
    }

    populateCampaigns() {
        this.campaignService.getCampaignsByClient(this.user.sessionUser.sessionClient)
            .subscribe(campaigns => this.campaigns = campaigns);
    }

    getCampaignDescById(id:number):string {
        return this.campaigns.find(c => c.campaignId == id).name;
    }

    removeFilter(filterType:PayrollFilterType) {
        this.removeActiveFilter(filterType);
        switch (filterType) {
            case PayrollFilterType.startDate:
                this.filters.startDate = null;
                break;
            case PayrollFilterType.endDate:
                this.filters.endDate = null;
                break;
            case PayrollFilterType.agent:
                this.filters.agentId = null;
                break;
            case PayrollFilterType.campaign:
                this.filters.campaignId = null;
                break;
            case PayrollFilterType.weekEnding:
                this.filters.weekEnding = null;
                break;
            case PayrollFilterType.isAutomated:
                this.filters.isAutomated = null;
                break;
            case PayrollFilterType.isReleased:
                this.filters.isReleased = null;
                break;
            case PayrollFilterType.automatedRelease:
                this.filters.automatedRelease = null;
                break;
            default:
                break;
        }
        this.setActiveFiltersStatus();
    }

    getPayrollStatus(item:Payroll) {
        return item.payCycle.isClosed
            ? 'Closed'
            : item.isReleased
                ? 'Released'
                : 'Pending';
    }

    masterToggle():void {
        this.isAllSelected() ?
            this.selection.clear() :
            this._payrolls.forEach(p => {
                if (p.isReleased || p.payCycle.isClosed) return;
                this.selection.select(p);
            });
    }

    isAllSelected():boolean {
        const numSelected = this.selection.selected.length;
        const numRows = this._payrolls.filter(p => !p.isReleased).length;
        return numSelected === numRows;
    }

    showExpensesAndOverrides(payroll:Payroll, detail:PayrollDetails) {
        this.dialog.open(OverrideExpenseDialogComponent, {
            width: '60vw',
            maxHeight: '80vh',
            data: {
                payCycle: payroll.payCycle,
                detail: detail,
                agents: this.agents
            }
        })
        .afterClosed()
        .subscribe((result:PayrollDetails) => {
            if (result == null) return;

            console.dir(result);

            /** I believe this is removing the $ from the string? */
            // if (isNaN((<any>result.taxes).charAt(0)))
            //     result.taxes = (<any>result.taxes).slice(0, 1);
            // if (isNaN((<any>result.grossTotal).charAt(0)))
            //     result.grossTotal = (<any>result.grossTotal).slice(0, 1);
            // if (isNaN((<any>result.netTotal).charAt(0)))
            //     result.netTotal = (<any>result.netTotal).slice(0, 1);

            // result.overrides.forEach((o, i, a) => {
            //     if (isNaN((<any>o.amount).charAt(0)))
            //         a[i].amount = (<any>o.amount).slice(1);
            // });

            // result.expenses.forEach((e, i, a) => {
            //     if (isNaN((<any>e.amount).charAt(0)))
            //         a[i].amount = (<any>e.amount).slice(1);

            //     a[i].expenseId = e.expenseId > 0 ? e.expenseId : null;
            // });
            
            this.service.savePayrollDetails(this.user.sessionUser.sessionClient, result)
                .subscribe(res => {
                    this.setPayrolls(res);
                    this.applyFilters();

                    this.msg.addMessage('Successfully updated overrides & expenses.', 'dismiss', 5000);
                });
        });
    }

    /**
     * Show's dialog to the user confirming their selections and showing overall total they'll 
     * be confirming to pay for the released cycles.
     */
    showReleaseConfirm() {

        this.dialog.open(ConfirmReleaseDialogComponent, {
            width: '50vw',
            data: {
                payrolls: this.selection.selected
            },
            autoFocus: false
        })
        .afterClosed()
        .subscribe(result => {
            if (!result) return;

            const payrollIds = this.selection.selected.map(p => p.payrollId);

            this.service.setReleased(this.user.sessionUser.sessionClient, payrollIds)
                .subscribe(() => {
                    payrollIds.forEach(id => {
                        this._payrolls.forEach((p, i, a) => {
                            if (p.payrollId != id) return;
                            a[i].isReleased = true;
                            a[i].payCycle.isPending = false;
                        });
                    });

                    this.setPayrolls(this._payrolls);
                    this.applyFilters();
                    this.msg.addMessage('Successfully released!', 'dismiss', 5000);
                });
        });

    }

    private applyFilters() {
        if (this._payrolls == null || !this._payrolls.length) return;

        /** let's set our initial filter dates based on what came back from the api */
        // if ((this.filters.startDate == null || this.filters.endDate == null) && this._payrolls.length) {
        //     const sortedPayrolls = this._payrolls.sort((a, b) => moment(a.weekEnding).isAfter(b.weekEnding, 'day') ? 1 : 0);
        //     const mostRecentWeekending = sortedPayrolls[sortedPayrolls.length - 1].weekEnding;
        //     this.filters.endDate = moment(mostRecentWeekending).add(7, 'days');
        //     this.filters.startDate = moment(mostRecentWeekending).subtract(7, 'days');
        // }

        let filteredPayrolls:Payroll[] = this._payrolls;
        // TODO: Bad logic, this hides data that should be apparent to the user that it exists
        // filteredPayrolls = this._payrolls.filter(p => {
        //     const startDate = this.filters.startDate;
        //     const endDate = this.filters.endDate;
        //     return moment(p.weekEnding).isBetween(startDate, endDate, 'd', MomentInclusivity.includeBoth);
        // });
        
        this.filters.activeFilters.forEach(af => {
            filteredPayrolls = this.applyFilterByType(filteredPayrolls, af);
        });

        /** TODO: for now we're going to stripped closed cycles out until we add to filter */
        // filteredPayrolls = filteredPayrolls.filter(f => !f.payCycle.isClosed);

        // this is the only time we set the payroll subject direclty without the setPayrolls() method
        this.payrolls$.next(filteredPayrolls);

        this.displayingResults = `Displaying ${filteredPayrolls.length} of ${this._payrolls.length} possible results`;
    }

    private applyFilterByType(payrolls:Payroll[], type:PayrollFilterType):Payroll[] {
        let result:Payroll[];
        switch (type) {
            case PayrollFilterType.agent:
                result = payrolls.map((p, i, a) => {
                    const hasDetails = p.details.find(d => d.agentId == this.filters.agentId) != null;
                    if (hasDetails) {
                        p.details = p.details.filter(d => d.agentId == this.filters.agentId);
                        return p;
                    }
                });
                break;
            case PayrollFilterType.campaign: 
                result = payrolls.filter(p => p.campaignId == this.filters.campaignId);
                break;
            case PayrollFilterType.isAutomated:
                result = payrolls.filter(p => p.isAutomated == this.filters.isAutomated);
                break;
            case PayrollFilterType.isReleased:
                result = payrolls.filter(p => p.isReleased == this.filters.isReleased && p.isReleased);
                break;
            case PayrollFilterType.automatedRelease:
                result = payrolls.filter(p => moment(p.automatedRelease).isSame(this.filters.automatedRelease, 'days'));
                break;
            case PayrollFilterType.weekEnding:
                result = payrolls.filter(p => moment(p.weekEnding).isSame(this.filters.weekEnding));
                break;
            default:
                result = payrolls;
                break;
        }

        return result.filter(r => r);
    }

    private setActiveFiltersStatus() {
        let setFiltersActive = false;
        
        if (this.filters.activeFilters.length)
            setFiltersActive = true;

        if (this._isFilterBtnActive != setFiltersActive) {
            this._isFilterBtnActive = setFiltersActive;
            this.isFilterBtnActive$.next(this._isFilterBtnActive);
        }
    }

    private removeActiveFilter(type:PayrollFilterType) {
        this.filters.activeFilters.splice(
            this.filters.activeFilters.indexOf(type), 1
        );
        this.setActiveFiltersStatus();
        this.applyFilters();
    }

    private initializeComponent() {
        this.service.getPayrollList(this.user.sessionUser.sessionClient, this.user.id)
            .subscribe(payrolls => {
                if (!isArray(payrolls)) {
                    this.session.hideLoader();
                    return;
                }
                this.setPayrolls(payrolls);
                this.applyFilters();

                if (this.agents == null) 
                    this.agents = [];

                this._payrolls.forEach(p => {
                    p.details.forEach(d => {
                        if (d.agent == null) return;
                        if (this.agents.find(a => a.agentId == d.agentId) != null)
                            return;
                        this.agents = this.agents.concat(d.agent);
                    });
                });

                this.session.hideLoader();
            });
    }

    
}
