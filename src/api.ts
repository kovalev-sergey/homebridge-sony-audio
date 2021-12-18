/**
 * Request to get a supported services and its information
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getsupportedapiinfo_v1_0).
 */
export const ApiRequestSupportedApiInfo = {
  id: 5,
  method: 'getSupportedApiInfo',
  params:[
    {
      services: null,
    },
  ],
  version: '1.0',
};

/**
 * Request to get a general system information for the device.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getsysteminformation_v1_4).
 */
export const ApiRequestSystemInformation = {
  method: 'getSystemInformation',
  id: 65,
  params: [],
  version: '1.4',
};

/**
 * Request to get an information about the current status of all external input and output terminal sources of the device.
 * For a device that has no external input or output connectors, this APi should return an empty result with no error codes.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getcurrentexternalterminalsstatus_v1_0).
 */
export const ApiRequestCurrentExternalTerminalsStatus = {
  method: 'getCurrentExternalTerminalsStatus',
  id: 66,
  params: [],
  version: '1.0',
};

/**
 * Gets the current volume level and mute status.
 * Uses for init info about volume settings.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getvolumeinformation_v1_1)
 */
export const ApiRequestVolumeInformation = {
  method: 'getVolumeInformation',
  id: 33,
  params :[ {} ],
  version: '1.1',
};

/**
 * Gets the current power status of the device.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getpowerstatus_v1_1)
 */
export const ApiRequestGetPowerStatus = {
  id: 50,
  method: 'getPowerStatus',
  params: [],
  version:'1.1',
};

/**
 * This API provides the list of schemes that device can handle.  
 * Lib: `avContent`  
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getschemelist_v1_0)
 */
export const ApiRequestGetSchemeList = {
  method: 'getSchemeList',
  id: 1,
  params: [],
  version: '1.0',
};

/**
 * This API provides information of WebAPI interface provided by the server.  
 * Lib: `system`  
 * This API must not include private information.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getinterfaceinformation_v1_0)
 */
export const ApiRequestGetInterfaceInformation = {
  method: 'getInterfaceInformation',
  id: 33,
  params: [],
  version: '1.0',
};


export type ApiNotification = {
  name: string;
  version: string;
};

/**
 * Api Response when receive notification
 */
export interface ApiNotificationResponce {
  method: string;
  params: [];
  version: string;
}

/**
 * The notification sent by a device when its volume information or mute status changes.  
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_notifyvolumeinformation_v1_0)
 */
export interface ApiResponceNotifyVolumeInformation {
  method: NotificationMethods.VOLUME;
  params: [
    {
      mute: 'on' | 'off' | 'toggle' | '';
      output: string;
      volume: number;
     }
  ];
  version: string;
}

/**
 * The notification sent by a device when its power status changes.  
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_notifypowerstatus_v1_0)
 * and [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getpowerstatus_v1_1)
 */
export interface ApiResponceNotifyPowerStatus {
  method: NotificationMethods.POWER;
  params: [
    PowerStatus,
  ];
  version?: string;
}

/**
 * The notification sent by a device when its current status of external input and output terminal sources changes.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getcurrentexternalterminalsstatus_v1_0).
 */
export interface ApiResponceNotifyExternalTerminalStatus {
  method: NotificationMethods.TERMINAL;
  params: [
    ExternalTerminal,
  ];
  version?: string;
}

/**
 * Describes the device power status.  
 */
export interface PowerStatus {
  /**
   * Additional information for the standby power state. If this value is omitted or "", then no additional information is available.
   * * `` - No additional information is available.
   * * `normalStandby` - The device is in its normal standby state.
   * * `quickStartStandby` - The device is in its quick-start standby state. The device can transition quickly to an active state.
   */
  standbyDetail?: 'normalStandby' | 'quickStartStandby' | '';
      /**
       * The current power status of the device.  
       * * `active` - The device is in the power-on state.  
       * * `standby` - The device is in the standby state. 
       * Network functions are active, and the device can switch to the power-on state via a network command.
       * * `shuttingDown` - The device is switching to the power-off state.

       */
      status: 'activating' | 'active' | 'standby' | 'shuttingDown';
}

/**
 * Provides an information about the current status of all external input and output terminal sources of the device.
 * For a device that has no external input or output connectors or an empty.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getcurrentexternalterminalsstatus_v1_0).
 */
export interface ExternalTerminal {
    /**
   * The active status of the terminal.  
   * For a terminal type of "meta:zone:output", the active status indicates whether the zone is enabled.  
   * For all other terminal types, the active status indicates whether the source is selected as an input source for any output zone.  
   * * `` - The active status could not be determined.  
   * * `active` - The terminal is enabled or a selected input source.  
   * * `inactive` - The terminal is disabled or not a selected input source.  
   */
  active?: '' | 'active' | 'inactive';
  /**
   * The connection status of the terminal.  
   * * `connected` - The terminal is connected.  
   * * `unconnected` - The terminal is not connected.  
   * * `unknown` - The connection status is unknown.
   */
  connection: 'connected' | 'unconnected' | 'unknown';
  /**
   * The icon URL that the service uses for the terminal, or "" if the service does not define an icon.
   */
  iconUrl?: string;
  /**
   * The label that the user assigned to this terminal.
   * * (ex) `Game`
   */
  label?: string;
  /**
   * Describes the type of terminal.  
   * For example, this can provide a hint to an application as to which icon to show to the user.
   */
  meta?: TerminalTypeMeta;
  /**
   * An array of the URIs of the output terminals that are available for this input terminal.  
   * For more information about the URI structure,
   * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.  
   * For an output terminal, this parameter is omitted or its value is null.
   */
  outputs?: string[];
  /**
   * The name of the input or output terminal.  
   * * (ex) `HDMI 2`
   * * (ex) `Component 1`
   */
  title: string;
  /**
   * The URI of the external terminal.  
   * For more information about the URI structure,
   * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
   * * (ex) `extInput:hdmi?port=2`
   */
  uri: string;
}

/**
 * Responce of the current power status of the device.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getpowerstatus_v1_1)
 */
export interface ApiResponcePowerStatus {
  id: number;
  result: [
    PowerStatus
  ];
}

/**
 * Describes the device volume settings.  
 */
export interface VolumeInformation {
  /**
   * The maximum volume level of the output; or -1 if no maximum value is available
   * or if the device does not support setting the volume by an absolute value.
   */
  maxVolume?: number;
  /**
   * The minimum volume level of the output; or -1 if no minimum value is available
   * or if the device does not support setting the volume by an absolute value.
   */
  minVolume?: number;
  /**
   * The current mute status of the output.
   */
  mute?: '' | 'off' | 'on' | 'toggle';
  /**
   * The URI of the output. For more information about the URI structure,
   * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
   * "" refers to all outputs of the device.
   */
  output?: string;
  /**
   * The volume level step value for the output;
   * or 0 if the device only supports setting the volume by an absolute value.
   */
  step?: number;
  /**
   * The current volume level of the output; or -1 if no volume information is available
   * or if the device does not support setting the volume by an absolute value.
   */
  volume?: number;
}

/**
 * Gets the current volume level and mute status.
 */
export interface ApiResponceVolumeInformation {
  id: number;
  result: [
    VolumeInformation[]
 ];
}

/**
 * Provides the list of schemes that device can handle.
 */
export interface ApiResponceSchemeList {
  id: number;
  result: [
    [
      {
        /**
         * Scheme name. Refer to [here](https://developer.sony.com/develop/audio-control-api/api-references/device-uri)
         * to know scheme and URI structure in detail.
         */
        scheme: string;
      }
    ]
  ];
}

/**
 * Provides an information about the current status of all external input and output terminal sources.
 */
export interface ApiResponceExternalTerminalStatus {
  id: number;
  result: [
    ExternalTerminal[]
 ];
}

/**
 * Describes the device playing content.  
 */
export interface PlayingContentInfo {
  /**
   * The source of the playing content, described by the base URI of the content, or "" if it is undefined.
   */
  source?: string;
  /**
   * The full URI of the playing content.  
   * For more information about the URI structure,
   * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
   */
  uri: string;
}

/**
 * The notification sent by a device when its playing content or active input changes.  
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_notifyplayingcontentinfo_v1_0)
 */
export interface ApiResponceNotifyPlayingContentInfo {
  method: NotificationMethods.CONTENT;
  params: [
    PlayingContentInfo
  ];
  version: string;
}


/**
 * Responce type for Subscribes and unsubscribes to multiple notifications at a time.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_switchnotifications_v1_0)
 */
export type ApiResponceSwitchNotifications = {
  id: number;
  result: {
   disabled: ApiNotification[];
   enabled: ApiNotification[];
   rejected: ApiNotification[];
   unsupported: ApiNotification[];
  }[];
};

/**
 * Sets the audio volume level.  
 * Lib: `audio`
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_setaudiovolume_v1_1)
 */
export interface ApiRequestSetAudioVolume {
  id: number;
  method: 'setAudioVolume';
  params: [
    {
      /**
       * The URI of the output. For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
       * Omit this field or use "" to affect all outputs for the device.
       * * (ex) "extOutput:zone?zone=2"
       */
      output: string;
      /**
       * The volume level to set or adjustment to make.
       * Use the getVolumeInformation method to determine whether the device uses absolute or relative values for this output.
       * * `N` - Set the volume level to N, where N is an integer, for example, "25".
       * * `+N` - Increase the volume level by N, where N is an integer, for example, "+14".
       * * `-N` - Decrease the volume level by N, where N is an integer, for example, "-10".
       */
      volume: string;
    }
  ];
  version: '1.1';
}

/**
 * Sets the power status of the device.  
 * Lib: `system`  
 * Recommended setup:
 * * QuickStart/Network Standby :ON
 *   * Required to receive commands while in standby mode.
 *   * EU STR is exception, it doesn't receive commands while in standby. Use WoL to turn on EU STR.
 * * Remote Start : ON
 *   * Required to turn on by WoL.
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_setpowerstatus_v1_1)
 */
export interface ApiRequestSetPowerStatus {
  id: number;
  method: 'setPowerStatus';
  /**
   * Additional information for the standby power state. If this value is omitted or "", then no additional information is available.
   */
  params:[
    {
      /**
       * Additional information for the standby power state. If this value is omitted or "",
       * then no additional information is available.
       */
      standbyDetail?: string;
      /**
       * The current power status of the device, or the status to set.
       * * `` - Changes the power status as if the remote power key is pressed. The power status is device and service dependent.
       * * `active` - The device is in the power-on state.
       * * `off` - The device is in the power-off state.
       * * `standby` - The device is in the standby state. Network functions are active, and the device can switch to the power-on state
       * via a network command. Not all products support standby, personalaudio products don't.
       */
      status: '' | 'active' | 'off' | 'standby';
    }
  ];
  version: '1.1';
}

/**
 * Sets the audio mute status.  
 * Lib: `audio`
 */
export interface ApiRequestSetAudioMute {
  id : number;
  method: 'setAudioMute';
  params:[
    {
      /**
       * The mute status to set or adjustment to make.
       * Use the getVolumeInformation method to determine whether the device uses on/off or toggle settings for this output.
       * * `off` - Not muted.
       * * `on` - Muted.
       * * `toggle` - Toggle the mute setting.
       */
      mute: 'off' | 'on' | 'toggle';
      /**
       * The URI of the output. For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
       * Omit this field or use "" to affect all outputs for the device.
       * * (ex) "extOutput:zone?zone=2"
       */
      output?: string;
    }
  ];
  version: '1.1';
}

/**
 * Toggles between the play and pause states for the current content.  
 * Lib: `avContent`  
 * In the pause state, playback is suspended temporarily and can be restarted quickly.  
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_pauseplayingcontent_v1_1)
 */
export interface ApiRequestPausePlayingContent {
  method: 'pausePlayingContent';
  id: number;
  params:[
    {
      /**
       * The URI of the output. Omit this field or use `` to affect all outputs for the device.
       * For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
       * * (ex) `extOutput:zone?zone=2`
       */
      output?: string;
    },
  ];
  version: '1.1';
}

/**
 * Sets the playing content or changes the active input. 
 * Lib: `avContent`
 * This API can resume playback of content. This API also supports playlists.
 * Some request parameters for changing the play mode; such as positionMSec, resume, repeatType, keepLastFrame, and so on;
 * change volatile settings that affect the current playing state.
 */
export interface ApiRequestSetPlayContent {
  id: number;
  method: 'setPlayContent';
  params:[
    {
      /**
       * Applies only to video content. Indicates whether to keep the last frame when playback stops,
       * such as when the v1_1.stopPlayingContent or v1_1.pausePlayingContent method is called
       * or when the end of the content is reached.
       */
      keepLastFrame?: boolean;
      /**
       * The URI of the output terminal to affect.
       * To get information about the current status of all external output terminal sources of the device, 
       * see the v1_0.getCurrentExternalTerminalsStatus method.  
       * For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
       */
      output?: string;
      /**
       * The playing position within the content, in milliseconds.  
       * The default value, `-1`, indicates the beginning or last position, depending on the device and service.
       */
      positionMsec?: number;
      /**
       * @deprecated for unit consistency with other API.  
       * The position to be started by seek operation.  
       * Default value is `-1`. (It means a head of a content or last position.
       * This depends on a server spec.)
       */
      positionSec?: number;
      /**
       * Indicates whether repeat playback is enabled for the unit of content that is currently playing.
       * * `off` - Repeat playback is disabled.
       * * `on` - Repeat playback is enabled.
       */
      repeatType?: 'off'| 'on';
      /**
       * Indicates the originator of the API call.  
       * The device may behave differently depending on the originator.
       * * `ui` - This method was called in response to the user interacting directly with the device UI.
       * * `user` - This method was called in response to some user action.
       */
      requester?: 'iu' | 'user';
      /**
       * True to resume play; otherwise, false.
       */
      resume?: boolean;
      /**
       * The URI of the input or source.  
       * To resume normal playback from a seek, pause, or stop status, set the URI to `null` or ``.  
       * For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.  
       * Some devices can switch input or content to the previously selected content
       * by specifying just the scheme or the scheme and source, for example **"tv:"** or **"tv:isdbt"**, respectively.  
       * For more information about the URIs supported for a given device, see the Supported URIs section
       * of the **Home Theater** or **Personal Audio** page under the **Device Info** menu.
       */
      uri: string;
    }
  ];
  version: '1.2';
}

/**
 * Gets information about the playing content or current selected input.  
 * Lib: `avContent`  
 * If the device is not currently playing content, then the response state parameter is "STOPPED".
 */
export interface ApiRequestPlayingContentInfo {
  id: number;
  method: 'getPlayingContentInfo';
  params:[
    {
      /**
       * The URI of the output. Omit this field or use `` to affect all outputs for the device.
       * For more information about the URI structure,
       * see the [Device Resource URI](https://developer.sony.com/develop/audio-control-api/api-references/device-uri) page.
       * * (ex) "extOutput:zone?zone=2"
       */
      output?: string;
    }
  ];
  version: '1.2';
}

/**
 * Information about the playing content or current selected input.
 */
export interface ApiResponcePlayingContentInfo {
  id: number;
  result: [
    PlayingContentInfo[]
  ];
}

/**
 * Provides information of WebAPI interface provided by the server.
 * This API must not include private information
 * Docs [here](https://developer.sony.com/develop/audio-control-api/api-references/api-overview-2#_getinterfaceinformation_v1_0)
 */
export interface ApiResponceInterfaceInformation {
  id: number;
  result: [
    {
      /**
       * Version for client to change its behavior w.r.t significant difference within productCategory.  
       * This version is managed/controlled within each productCategory.
       * This parameter is composed of "[X].[Y].[Z]", where [X], [Y] and [Z] are string representing integer
       * and concatenated with period "." in between.
       */
      interfaceVersion: string;
      /**
       * Model name.
       */
      modelName: string;
      /**
       * Category name of device.
       */
      productCategory: 'camera' | 'tv' | 'internetTV' | 'videoServer' | 'homeTheaterSystem' | 'videoPlayer' | 'personalAudio';
      /**
       * More detail product information can be returned if productCategory is not enough.
       */
      productName: string;
      /**
       * Server name. In case device can launch multiple Scalar WebAPI servers, return this server's name for client to distinguish.
       */
      serverName: string;
    }
  ];
}

export class GenericApiError extends Error {
  code: number;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, UnsupportedVersionApiError.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GenericApiError);
    }
    this.name = 'GENERIC_API_ERROR';
    this.code = 1;
  }
}

export class UnsupportedVersionApiError extends GenericApiError {
  code: number;

  constructor(message: string) {
    super(message);
    this.name = 'UNSUPPORTED_VERSION_API';
    this.code = 14;
  }
}

export class IncompatibleDeviceCategoryError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, IncompatibleDeviceCategoryError.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, IncompatibleDeviceCategoryError);
    }
    this.name = 'INCOMPATIBLE_DEVICE_CATEGORY';
  }
}

/**
 * Describes the type of terminal.  
 * For example, this can provide a hint to an application as to which icon to show to the user.
 * The type is provided using a "meta" URI format.  
 * Your application should customize its UI based on the type of the terminal, such as choosing an appropriate image.  
 * The following meta URIs are defined, not all are used by all products.
 */
export const enum TerminalTypeMeta {
 /**
  *No meta information is available for this terminal
  */
 NO_INFO = '',
 /**
  * An audio system type CEC device is connected to the terminal
  */
 AUDIOSYSTEM = 'meta:audiosystem',
 /**
  * An AV amplifier is connected to the terminal
  */
 AVAMP = 'meta:avamp',
 /**
  * BD/DVD input
  */
 BD_DVD = 'meta:bd-dvd',
 /**
  * Bluetooth audio input
  */
 BTAUDIO = 'meta:btaudio',
 /**
  * BT phone input
  */
 BTPHONE = 'meta:btphone',
 /**
  * A video camera is connected to the terminal
  */
 CAMCODER = 'meta:camcoder',
 /**
  * Coaxial digital audio input
  */
 COAXIAL = 'meta:coaxial',
 /**
  * A complex device is connected to the terminal
  */
 COMPLEX = 'meta:complex',
 /**
  * Component input (Y and Pb/Cb and Pr/Cr connectors)
  */
 COMPONENT = 'meta:component',
 /**
  * D-Component input
  */
 COMPONENTD = 'meta:componentd',
 /**
  * Composite input
  */
 COMPOSITE = 'meta:composite',
 /**
  * Composite and D-Component combined input
  */
 COMPOSITE_COMPONENTD = 'meta:composite_componentd',
 /**
  * A digital camera is connected to the terminal
  */
 DIGITALCAMERA = 'meta:digitalcamera',
 /**
  * A disk player is connected to the terminal
  */
 DISC = 'meta:disc',
 /**
  * D-subminiature 15pin input
  */
 DSUB15 = 'meta:dsub15',
 /**
  * A game console is connected to the terminal
  */
 GAME = 'meta:game',
 /**
  * HDMI input
  */
 HDMI = 'meta:hdmi',
 /**
  * HDMI output
  */
 HDMI_OUTPUT = 'meta:hdmi:output',
 /**
  * A home theater device is connected to the terminal
  */
 HOMETHEATER = 'meta:hometheater',
 /**
  * Axillary input
  */
 LINE = 'meta:line',
 /**
  * A mini audio port, the exact hardware port is device dependent
  */
 LINEMINI = 'meta:linemini',
 /**
  * Optical digital audio input
  */
 OPTICAL = 'meta:optical',
 /**
  * A personal computer is connected to the terminal
  */
 PC = 'meta:pc',
 /**
  * A playback type CEC device is connected to the terminal
  */
 PLAYBACKDEVICE = 'meta:playbackdevice',
 /**
  * A recording type CEC device is connected to the terminal
  */
 RECORDINGDEVICE = 'meta:recordingdevice',
 /**
  * SCART input
  */
 SCART = 'meta:scart',
 /**
  * S-Video input
  */
 SVIDEO = 'meta:svideo',
 /**
  * A tape player is connected to the terminal
  */
 TAPE = 'meta:tape',
 /**
  * A tuner is connected to the terminal
  */
 TUNER = 'meta:tuner',
 /**
  * A tuner type CEC device is connected to the terminal
  */
 TUNERDEVICE = 'meta:tunerdevice',
 /**
  * A TV type CEC device is connected to the terminal
  */
 TV = 'meta:tv',
 /**
  * USB DAC input
  */
 USBDAC = 'meta:usbdac',
 /**
  * WiFi Display input
  */
 WIFIDISPLAY = 'meta:wifidisplay',
 /**
  * Wireless transceiver
  */
 WIRELESSTRANSCEIVER_OUTPUT = 'meta:wirelessTransceiver:output',
 /**
  * Source input
  */
 SOURCE = 'meta:source',
 /**
  * SACD/CD input
  */
 SACD_CD = 'meta:sacd-cd',
 /**
  * SAT/CATV input
  */
 SAT_CATV = 'meta:sat-catv',
 /**
  * Video input
  */
 VIDEO = 'meta:video',
 /**
  * Zone output
  */
 ZONE_OUTPUT = 'meta:zone:output',
}

export const enum NotificationMethods {
  POWER = 'notifyPowerStatus',
  VOLUME = 'notifyVolumeInformation',
  TERMINAL = 'notifyExternalTerminalStatus',
  CONTENT = 'notifyPlayingContentInfo',
}

