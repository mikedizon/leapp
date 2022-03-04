import { Component, ElementRef, Input, OnInit, ViewChild } from "@angular/core";
import { FormControl, FormGroup, Validators } from "@angular/forms";
import { AppService } from "../../../services/app.service";
import { ActivatedRoute, Router } from "@angular/router";
import * as uuid from "uuid";
import { BsModalService } from "ngx-bootstrap/modal";
import { openIntegrationEvent } from "../../integration-bar/integration-bar.component";
import { SessionType } from "@noovolari/leapp-core/models/session-type";
import { WorkspaceService } from "@noovolari/leapp-core/services/workspace-service";
import { AwsIamRoleFederatedService } from "@noovolari/leapp-core/services/session/aws/aws-iam-role-federated-service";
import { AwsIamUserService } from "@noovolari/leapp-core/services/session/aws/aws-iam-user-service";
import { AwsIamRoleChainedService } from "@noovolari/leapp-core/services/session/aws/aws-iam-role-chained-service";
import { LoggerLevel, LoggingService } from "@noovolari/leapp-core/services/logging-service";
import { LeappCoreService } from "../../../services/leapp-core.service";
import { constants } from "@noovolari/leapp-core/models/constants";
import { WindowService } from "../../../services/window.service";
import { AwsIamRoleFederatedSessionRequest } from "@noovolari/leapp-core/services/session/aws/aws-iam-role-federated-session-request";
import { AwsIamUserSessionRequest } from "@noovolari/leapp-core/services/session/aws/aws-iam-user-session-request";
import { AwsIamRoleChainedSessionRequest } from "@noovolari/leapp-core/services/session/aws/aws-iam-role-chained-session-request";
import { AzureSessionRequest } from "@noovolari/leapp-core/services/session/azure/azure-session-request";
import { MessageToasterService, ToastLevel } from "../../../services/message-toaster.service";
import { LeappParseError } from "@noovolari/leapp-core/errors/leapp-parse-error";
import { AzureService } from "@noovolari/leapp-core/services/session/azure/azure-service";

@Component({
  selector: "app-create-dialog",
  templateUrl: "./create-dialog.component.html",
  styleUrls: ["./create-dialog.component.scss"],
})
export class CreateDialogComponent implements OnInit {
  @Input() selectedSession;
  @Input() selectedAccountNumber = "";
  @Input() selectedRole = "";
  @Input() selectedSamlUrl = "";

  @ViewChild("roleInput", { static: false })
  roleInput: ElementRef;

  firstTime = false;
  providerSelected = false;
  typeSelection = false;
  hasOneGoodSession = false;
  hasSsoUrl = false;

  sessionType;
  provider;

  idpUrls: { value: string; label: string }[] = [];
  selectedIdpUrl: { value: string; label: string };

  profiles: { value: string; label: string }[] = [];
  selectedProfile: { value: string; label: string };

  assumerAwsSessions = [];

  regions = [];
  selectedRegion;
  locations = [];
  selectedLocation;

  eSessionType = SessionType;

  public form = new FormGroup({
    idpArn: new FormControl("", [Validators.required]),
    accountNumber: new FormControl("", [Validators.required, Validators.maxLength(12), Validators.minLength(12)]),
    subscriptionId: new FormControl("", [Validators.required]),
    tenantId: new FormControl("", [Validators.required]),
    name: new FormControl("", [Validators.required]),
    role: new FormControl("", [Validators.required]),
    roleArn: new FormControl("", [Validators.required]),
    roleSessionName: new FormControl("", [Validators.pattern("[a-zA-Z\\d\\-\\_\\@\\=\\,\\.]+")]),
    federatedOrIamRoleChained: new FormControl("", [Validators.required]),
    federatedRole: new FormControl("", [Validators.required]),
    federationUrl: new FormControl("", [Validators.required, Validators.pattern("https?://.+")]),
    secretKey: new FormControl("", [Validators.required]),
    accessKey: new FormControl("", [Validators.required]),
    awsRegion: new FormControl(""),
    mfaDevice: new FormControl(""),
    awsProfile: new FormControl("", [Validators.required]),
    azureLocation: new FormControl("", [Validators.required]),
    assumerSession: new FormControl("", [Validators.required]),
    selectAccessStrategy: new FormControl(SessionType.awsIamRoleFederated, [Validators.required]),
  });

  private workspaceService: WorkspaceService;
  private awsIamRoleFederatedService: AwsIamRoleFederatedService;
  private awsIamUserService: AwsIamUserService;
  private awsIamRoleChainedService: AwsIamRoleChainedService;
  private azureService: AzureService;
  private loggingService: LoggingService;

  /* Setup the first account for the application */
  constructor(
    private appService: AppService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private bsModalService: BsModalService,
    private leappCoreService: LeappCoreService,
    private windowService: WindowService,
    private messageToasterService: MessageToasterService
  ) {
    this.workspaceService = leappCoreService.workspaceService;
    this.awsIamRoleFederatedService = leappCoreService.awsIamRoleFederatedService;
    this.awsIamUserService = leappCoreService.awsIamUserService;
    this.awsIamRoleChainedService = leappCoreService.awsIamRoleChainedService;
    this.azureService = leappCoreService.azureService;
    this.loggingService = leappCoreService.loggingService;
  }

  ngOnInit(): void {
    this.activatedRoute.queryParams.subscribe((params) => {
      // Get the workspace and the accounts you need
      const workspace = this.leappCoreService.repository.getWorkspace();

      // We get all the applicable idp urls
      if (workspace.idpUrls && workspace.idpUrls.length > 0) {
        workspace.idpUrls.forEach((idp) => {
          if (idp !== null && idp.id) {
            this.idpUrls.push({ value: idp.id, label: idp.url });
          }
        });
      }

      // We got all the applicable profiles
      // Note: we don't use azure profile so we remove default azure profile from the list
      workspace.profiles.forEach((idp) => {
        if (idp !== null && idp.name !== constants.defaultAzureProfileName && idp.id) {
          this.profiles.push({ value: idp.id, label: idp.name });
        }
      });

      // This way we also fix potential incongruences when you have half saved setup
      this.hasOneGoodSession = workspace.sessions.length > 0;
      this.firstTime = params["firstTime"] || !this.hasOneGoodSession;

      // Show the assumable accounts
      this.assumerAwsSessions = this.leappCoreService.repository.listAssumable().map((session) => ({
        sessionName: session.sessionName,
        session,
      }));

      // Only for start screen: disable IAM Chained creation
      if (this.firstTime) {
        this.form.controls["federatedOrIamRoleChained"].disable({ onlySelf: true });
      }

      // Get all regions and locations from app service lists
      this.regions = this.leappCoreService.awsCoreService.getRegions();
      this.locations = this.leappCoreService.azureCoreService.getLocations();

      // Select default values
      this.selectedRegion = workspace.defaultRegion || constants.defaultRegion || this.regions[0].region;
      this.selectedLocation = workspace.defaultLocation || constants.defaultLocation || this.locations[0].location;
      this.selectedProfile = workspace.profiles.filter((p) => p.name === "default").map((p) => ({ value: p.id, label: p.name }))[0];
    });
  }

  /**
   * Add a new UUID
   */
  addNewUUID(): string {
    return uuid.v4();
  }

  /**
   * Save the first account in the workspace
   */
  saveSession(): void {
    this.loggingService.logger(`Saving account...`, LoggerLevel.info, this);
    this.addProfileToWorkspace();
    this.addIpdUrlToWorkspace();
    this.createSession();
    this.router.navigate(["/dashboard"]).then(() => {});
  }

  /**
   * Form validation mechanic
   */
  formValid(): boolean {
    let result = false;
    switch (this.sessionType) {
      case SessionType.awsIamRoleFederated:
        result =
          this.form.get("name").valid &&
          this.selectedProfile &&
          this.form.get("awsRegion").valid &&
          this.form.get("roleArn").valid &&
          this.selectedIdpUrl &&
          this.form.get("idpArn").valid;
        break;
      case SessionType.awsIamRoleChained:
        result =
          this.form.get("name").valid &&
          this.selectedProfile &&
          this.form.get("awsRegion").valid &&
          this.form.get("roleArn").valid &&
          this.form.get("roleSessionName").valid &&
          this.selectedSession;
        break;
      case SessionType.awsIamUser:
        result =
          this.form.get("name").valid &&
          this.selectedProfile &&
          this.form.get("awsRegion").valid &&
          this.form.get("mfaDevice").valid &&
          this.form.get("accessKey").valid &&
          this.form.get("secretKey").valid;
        break;
      case SessionType.azure:
        result =
          this.form.get("name").valid &&
          this.form.get("subscriptionId").valid &&
          this.form.get("tenantId").valid &&
          this.form.get("azureLocation").valid;
        break;
    }
    return result;
  }

  /**
   * First step of the wizard: set the Cloud provider or go to the SSO integration
   *
   * @param name
   */
  setProvider(name: SessionType): void {
    this.provider = name;
    this.providerSelected = true;
    this.sessionType = name;
    this.typeSelection = name.toString().indexOf("aws") > -1;
  }

  /**
   * Second step of wizard: set the strategy in the UI
   *
   * @param strategy
   */
  setAccessStrategy(strategy: SessionType): void {
    this.sessionType = strategy;
    this.provider = strategy;
    this.typeSelection = false;

    if (strategy === SessionType.awsIamRoleFederated) {
      this.hasSsoUrl = true;
    }
  }

  /**
   * Open the Leapp documentation in the default browser
   *
   */
  openAccessStrategyDocumentation(): void {
    let url = "https://docs.leapp.cloud/configuring-session/configure-aws-iam-role-federated/";
    if (this.provider === SessionType.awsIamRoleChained) {
      url = "https://docs.leapp.cloud/configuring-session/configure-aws-iam-role-chained/";
    } else if (this.provider === SessionType.awsIamUser) {
      url = "https://docs.leapp.cloud/configuring-session/configure-aws-iam-user/";
    }
    this.windowService.openExternalUrl(url);
  }

  /**
   * Go to the Single Sing-On integration page
   *
   */
  goToAwsSso(): void {
    this.appService.closeModal();
    openIntegrationEvent.next(true);
  }

  /**
   * Go to Session Selection screen by closing the modal
   */
  goBack(): void {
    this.appService.closeModal();
  }

  getNameForProvider(provider: SessionType): string {
    switch (provider) {
      case SessionType.azure:
        return "Microsoft Azure session";
      case SessionType.google:
        return "Google Cloud session";
      case SessionType.alibaba:
        return "Alibaba Cloud session";
      default:
        return "Amazon AWS session";
    }
  }

  getIconForProvider(provider: SessionType): string {
    switch (provider) {
      case SessionType.azure:
        return "azure-logo.svg";
      case SessionType.google:
        return "google.png";
      case SessionType.alibaba:
        return "alibaba.png";
      default:
        return "aws-logo.svg";
    }
  }

  closeModal(): void {
    this.appService.closeModal();
  }

  selectedIdpUrlEvent($event: { items: any[]; item: any }): void {
    this.idpUrls = $event.items;
    this.selectedIdpUrl = $event.item;
  }

  /**
   * Save actual session based on Session Type
   *
   * @private
   */
  private createSession() {
    if (this.formValid()) {
      switch (this.sessionType) {
        case SessionType.awsIamRoleFederated:
          const awsFederatedAccountRequest: AwsIamRoleFederatedSessionRequest = {
            sessionName: this.form.value.name.trim(),
            region: this.selectedRegion,
            idpUrl: this.selectedIdpUrl.value.trim(),
            idpArn: this.form.value.idpArn.trim(),
            roleArn: this.form.value.roleArn.trim(),
            profileId: this.selectedProfile.value,
          };
          this.awsIamRoleFederatedService.create(awsFederatedAccountRequest);
          break;
        case SessionType.awsIamUser:
          const awsIamUserSessionRequest: AwsIamUserSessionRequest = {
            sessionName: this.form.value.name.trim(),
            region: this.selectedRegion,
            accessKey: this.form.value.accessKey.trim(),
            secretKey: this.form.value.secretKey.trim(),
            mfaDevice: this.form.value.mfaDevice.trim(),
            profileId: this.selectedProfile.value,
          };
          this.awsIamUserService.create(awsIamUserSessionRequest).then(() => {});
          break;
        case SessionType.awsIamRoleChained:
          const awsIamRoleChainedAccountRequest: AwsIamRoleChainedSessionRequest = {
            sessionName: this.form.value.name.trim(),
            region: this.selectedRegion,
            roleArn: this.form.value.roleArn.trim(),
            roleSessionName: this.form.value.roleSessionName.trim(),
            parentSessionId: this.selectedSession.sessionId,
            profileId: this.selectedProfile.value,
          };
          this.awsIamRoleChainedService.create(awsIamRoleChainedAccountRequest);
          break;
        case SessionType.azure:
          const azureSessionRequest: AzureSessionRequest = {
            region: this.selectedLocation,
            sessionName: this.form.value.name,
            subscriptionId: this.form.value.subscriptionId,
            tenantId: this.form.value.tenantId,
          };
          this.azureService.create(azureSessionRequest);
          break;
      }

      this.messageToasterService.toast(`Session: ${this.form.value.name}, created.`, ToastLevel.success, "");
      this.closeModal();
    } else {
      // eslint-disable-next-line max-len
      this.messageToasterService.toast(`Session is missing some required properties, please fill them.`, ToastLevel.warn, "");
    }
  }

  /**
   * Save a new Single Sign on object in workspace if new
   *
   * @private
   */
  private addIpdUrlToWorkspace() {
    if (this.sessionType === SessionType.awsIamRoleFederated) {
      try {
        const ipdUrl = { id: this.selectedIdpUrl.value, url: this.selectedIdpUrl.label };
        if (!this.leappCoreService.repository.getIdpUrl(ipdUrl.id)) {
          this.leappCoreService.repository.addIdpUrl(ipdUrl);
        }
      } catch (err) {
        throw new LeappParseError(this, err.message);
      }
    }
  }

  /**
   * Save a New profile if is not in the workspace
   *
   * @private
   */
  private addProfileToWorkspace() {
    try {
      const profile = { id: this.selectedProfile.value, name: this.selectedProfile.label };
      try {
        this.leappCoreService.repository.getProfileName(profile.id);
      } catch (e) {
        this.leappCoreService.repository.addProfile(profile);
      }
    } catch (err) {
      throw new LeappParseError(this, err.message);
    }
  }
}
