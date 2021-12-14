import * as fs from 'fs-extra';
import { Logger } from 'homebridge';
import * as path from 'path';

type InputSettings = {
  /**
     * Id of the input.  
     * Used as id from @see SonyAudioAccessory.getInputSubtype
     */
   id: string;
   /**
    * Name of the input.  
    */
   name?: string;
   /**
    * Visibility state fo the input.  
    */
   visibilityState?: 0 | 1;
};

/**
 * Represent a settings of Sony Accessory.
 */
export class SonyAudioAccessorySettings {
  /**
   * Full path of the file with persisted settings
   */
  private filePath: string;

  private inputs: InputSettings[];
  constructor(
    private readonly uuid: string,
    private readonly storagePath: string,
    private readonly logger: Logger,
  ) {
    this.filePath = path.resolve(this.storagePath, this.persistKey());
    this.inputs = [];
  }

  static async GetInstance(uuid: string, storagePath: string, logger: Logger) {
    // HOOBS return not existing path. #10
    // So, create it if it doesn't exist
    try {
      await fs.ensureDir(storagePath);
    } catch (error) {
      logger.debug(`The path to save the accessory settings doesn't exist and can't be created: ${storagePath}\nError\n${JSON.stringify(error)}`);
      logger.debug('Accessory settings will be reset after bridge restart');
    }

    const settings = new SonyAudioAccessorySettings(uuid, storagePath, logger);
    await settings.loadSettings();
    return settings;
  }

  private async saveSettings(): Promise<void> {
    // Allocate item for saving
    const item = {
      inputs: this.inputs,
    };
    try {
      await fs.writeJson(this.filePath, item);
      this.logger.debug(`Settings has been saved at path ${this.filePath}`);
    } catch (error) {
      this.logger.debug(`An error occurred while saving the settings.\nError\n${JSON.stringify(error)}`);
      this.logger.debug('Accessory settings will be reset after bridge restart');
    }
  }

  private async loadSettings(): Promise<void> {
    if (!await fs.pathExists(this.filePath)) {
      this.logger.debug(`Settings not found at path ${this.filePath}`);
      return;
    }
    try {
      const settings = await fs.readJson(this.filePath);
      this.logger.debug(`Settings has been loaded from ${this.filePath}`);
      this.inputs = settings.inputs;
    } catch (error) {
      this.logger.debug(`An error occurred while loading the settings.\nError\n${JSON.stringify(error)}`);
    }
  }

  private getInput(id: string) {
    return this.inputs.find(input => input.id === id);
  }

  async getInputName(id: string, defaultName: string) {
    let input = this.getInput(id);
    if (input === undefined || input.visibilityState === undefined) {
      input = await this.setInputName(id, defaultName);
    } 
    return input.name!;
  }

  async getInputVisibility(id: string, defaultVisibilityState: 0 | 1) {
    let input = this.getInput(id);
    if (input === undefined || input.visibilityState === undefined) {
      input = await this.setInputVisibility(id, defaultVisibilityState);
    } 
    return input.visibilityState!;
  }

  async setInputName(id: string, name: string) {
    let input = this.getInput(id);
    if (input && input.name === name) {
      return input;
    }
    if (input) {
      input.name = name;
    } else {
      input = { id, name };
      this.inputs.push(input);
    }
    await this.saveSettings();
    return input;
  }

  async setInputVisibility(id: string, visibilityState: 0 | 1) {
    let input = this.getInput(id);
    if (input && input.visibilityState === visibilityState) {
      return input;
    }
    if (input) {
      input.visibilityState = visibilityState;
    } else {
      input = { id, visibilityState };
      this.inputs.push(input);
    }
    await this.saveSettings();
    return input;
  }

  /**
   * Gets a key for storing this SonyAudioAccessorySettings in the filesystem, like "SonyAudioAccessorySettings.CC223DE3CEF3.json"
   * @returns 
   */
  private persistKey() {
    return `SonyAudioAccessorySettings.${this.uuid.replace(/-/g, '').toUpperCase()}.json`;
  }

}
