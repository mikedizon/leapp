import { Command } from '@oclif/core'
import { LeappCliService } from '../../service/leapp-cli-service'
import { Config } from '@oclif/core/lib/config/config'
import { Session } from '@noovolari/leapp-core/models/session'

export default class DeleteSession extends Command {
  static description = 'Delete a session'

  static examples = [
    `$leapp session delete`,
  ]

  constructor(argv: string[], config: Config, private leappCliService = new LeappCliService()) {
    super(argv, config)
  }

  async run(): Promise<void> {
    const selectedSession = await this.selectSession()
    try {
      await this.deleteSession(selectedSession)
    } catch (error) {
      this.error(error instanceof Error ? error.message : `Unknown error: ${error}`)
    }
  }

  public async selectSession(): Promise<Session> {
    const availableSessions = this.leappCliService.repository
      .getSessions()
    const answer: any = await this.leappCliService.inquirer.prompt([{
      name: 'selectedSession',
      message: 'select a session',
      type: 'list',
      choices: availableSessions.map(session => ({name: session.sessionName, value: session})),
    }])
    return answer.selectedSession
  }

  public async deleteSession(session: Session): Promise<void> {
    const sessionService = this.leappCliService.sessionFactory.getSessionService(session.type)
    await sessionService.delete(session.sessionId)
    this.log('Session deleted')
  }
}
