import { Command } from "@oclif/core";
import { LeappCliService } from "../../service/leapp-cli-service";
import { Config } from "@oclif/core/lib/config/config";
import { AwsNamedProfile } from "@noovolari/leapp-core/models/aws-named-profile";

export default class EditNamedProfile extends Command {
  static description = "Rename an AWS named profile";

  static examples = [`$leapp profile edit`];

  constructor(argv: string[], config: Config, private leappCliService = new LeappCliService()) {
    super(argv, config);
  }

  async run(): Promise<void> {
    try {
      const selectedNamedProfile = await this.selectNamedProfile();
      const newProfileName = await this.getProfileName();
      await this.editNamedProfile(selectedNamedProfile.id, newProfileName);
    } catch (error) {
      this.error(error instanceof Error ? error.message : `Unknown error: ${error}`);
    }
  }

  async selectNamedProfile(): Promise<AwsNamedProfile> {
    const namedProfiles = this.leappCliService.namedProfilesService.getNamedProfiles(true);
    if (namedProfiles.length === 0) {
      throw new Error("no profiles available");
    }
    const answer: any = await this.leappCliService.inquirer.prompt([
      {
        name: "selectedNamedProfile",
        message: `select a profile`,
        type: "list",
        choices: namedProfiles.map((profile) => ({ name: profile.name, value: profile })),
      },
    ]);
    return answer.selectedNamedProfile;
  }

  async getProfileName(): Promise<string> {
    const answer: any = await this.leappCliService.inquirer.prompt([
      {
        name: "namedProfileName",
        message: `choose a new name for the profile`,
        type: "input",
      },
    ]);
    return answer.namedProfileName;
  }

  async editNamedProfile(id: string, newName: string) {
    await this.leappCliService.namedProfilesService.editNamedProfile(id, newName);
    this.log("profile edited");
  }
}
