import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { User } from '@app/models';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { SessionService } from '@app/session.service';

interface DialogData {
    user:User,
}

@Component({
    selector: 'vs-add-import-model',
    templateUrl: './add-import-model.component.html',
    styleUrls: ['./add-import-model.component.scss']
})
export class AddImportModelComponent implements OnInit {

    user:User;
    form:FormGroup;

    constructor(
        public ref: MatDialogRef<AddImportModelComponent>,
        @Inject(MAT_DIALOG_DATA) public data:DialogData,
        private session:SessionService,
        private fb:FormBuilder
    ) { 
        this.user = this.data.user;

        if (!this.user) {
            this.session.getUserItem().subscribe(u => this.user = u);
        }
    }

    ngOnInit() {
    }

    onNoClick() {
        this.ref.close();
    }

    saveImportModel() {
        console.log('SAVE THIS DANG MODEL!');
    }

    // TODO: this needs to be continued
    private createForm() {
        this.form = this.fb.group({
            shortDesc: this.fb.control('', [Validators.required]),
            fullDesc: this.fb.control(''),
            map: this.fb.group({
                utilityId: this.fb.control('', [Validators.required]),
                campaignId: this.fb.control('', [Validators.required]),
                businessName: this.fb.control(''),
                firstName: this.fb.control(''),
                lastName: this.fb.control(''),
                splitCustomerName: this.fb.control(''),
                ssn: this.fb.control(''),
                dob: this.fb.control(''),
                street: this.fb.control('', [Validators.required]),
                street2: this.fb.control(''),
                city: this.fb.control('', [Validators.required]),
                state: this.fb.control('', [Validators.required]),
                zip: this.fb.control('', [Validators.required]),
                phone: this.fb.control(''),
                email: this.fb.control(''),
                podAccount: this.fb.control(''),
                saleDate: this.fb.control('', [Validators.required]),
                matchAgentBySalesCode: this.fb.control('', [Validators.required]),
                salesCode: this.fb.control(''),
                agentName: this.fb.control(''),
                utilityName: this.fb.control(''),
            }),
            userId: this.fb.control(this.user.id),
        });
    }

}