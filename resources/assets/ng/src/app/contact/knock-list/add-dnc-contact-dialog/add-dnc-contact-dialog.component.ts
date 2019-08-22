import { Component, OnInit, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { FormGroup, FormBuilder, Validators, ValidationErrors, AbstractControl } from '@angular/forms';
import { User, DncContact, GeocodingRequest, GeocodingResponseStatus } from '@app/models';
import { SessionService } from '@app/session.service';
import { States } from '@app/shared';
import { distinctUntilChanged } from 'rxjs/operators';
import { MessageService } from '@app/message.service';
import { ContactService } from '@app/contact/contact.service';

@Component({
    selector: 'vs-add-dnc-contact-dialog',
    templateUrl: './add-dnc-contact-dialog.component.html',
    styleUrls: ['./add-dnc-contact-dialog.component.scss']
})
export class AddDncContactDialogComponent implements OnInit {

    user:User;
    form:FormGroup;

    formSubmitted = false;
    states = States.$get();

    constructor(
        public ref: MatDialogRef<AddDncContactDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any,
        private fb:FormBuilder,
        private session:SessionService,
        private message:MessageService,
        private service: ContactService
    ) { }

    ngOnInit() {
        this.session.getUserItem().subscribe(user => {
            this.user = user;
            this.initializeComponent();
        });
    }

    initializeComponent() {
        this.createForm();
    }

    requiredValidator(control:AbstractControl):ValidationErrors | null {
        if (control.value) return null;
        return {
            required: true
        };
    }

    createForm() { 
        this.form = this.fb.group({
            clientId: this.fb.control(this.user.selectedClient),
            firstName: this.fb.control(''),
            lastName: this.fb.control(''),
            description: this.fb.control(''),
            address: this.fb.control('', [Validators.required]),
            addressCont: this.fb.control(''),
            city: this.fb.control('', [Validators.required]),
            state: this.fb.control('', [Validators.required]),
            zip: this.fb.control('', [Validators.required, Validators.pattern(/^\d+$/)]),
            note: this.fb.control('')
        });
    }

    prepareModel():DncContact {
        return {
            dncContactId: null,
            clientId: this.form.value.clientId,
            firstName: this.form.value.firstName,
            lastName: this.form.value.lastName,
            description: this.form.value.description,
            address: this.form.value.address,
            addressCont: this.form.value.addressCont,
            city: this.form.value.city,
            state: this.form.value.state,
            zip: this.form.value.zip,
            note: this.form.value.note
        } as DncContact;
    }

    onNoClick() {
        this.ref.close();
    }

    saveDncContact() {
        
        if (!this.form.value.firstName && !this.form.value.lastName && !this.form.value.description) {
            this.form.get('firstName').setErrors({ required: true });
            this.form.get('lastName').setErrors({ required: true });
            this.form.get('description').setErrors({ required: true });
            this.message.addMessage('Please enter one of the following: First & Last Names OR Description');
        }

        this.formSubmitted = true;
        this.form.updateValueAndValidity();
        console.log(`The form is valid: ${this.form.valid}`);
        console.dir(this.form);

        if (this.form.valid) {
            const address: GeocodingRequest = {
                address: this.form.value.address,
                city: this.form.value.city,
                state: this.form.value.state,
            };
            if (this.form.value.addressCont) {
                address.address2 = this.form.value.addressCont;
            }

            this.service.getGeocoding(address).subscribe(result => {
                if (result.status !== GeocodingResponseStatus.Ok) {
                    this.message.addMessage('We were unable to resolve that address. Please review for accuracy.', 'dismiss', 5000);
                    return;
                }

                const model = this.prepareModel();
                model.lat = result.results[0].geometry.location.lat.toString();
                model.long = result.results[0].geometry.location.lng.toString();
                model.geocode = JSON.stringify(result.results[0].geometry);

                this.ref.close(model);
            });
        }
    }

}
