import * as fs from 'fs-extra';
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
  ) {
    this.filePath = path.resolve(this.storagePath, this.persistKey());
    this.inputs = [];
  }

  static async GetInstance(uuid: string, storagePath: string) {
    const settings = new SonyAudioAccessorySettings(uuid, storagePath);
    await settings.loadSettings();
    return settings;
  }

  saveSettings() {
    // Allocate item for saving
    const item = {
      inputs: this.inputs,
    };
    return fs.writeJson(this.filePath, item);
  }

  async loadSettings() {
    if (!await fs.pathExists(this.filePath)) {
      return;
    }
    const settings = await fs.readJson(this.filePath);
    this.inputs = settings.inputs;
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
