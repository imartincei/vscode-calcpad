import * as vscode from 'vscode';
import * as settingsSchema from './calcpad-settings-schema.json';

let _outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('CalcPad Settings');
    }
    return _outputChannel;
}

export interface CalcpadSettings {
    math: {
        decimals: number;
        degrees: number;
        isComplex: boolean;
        substitute: boolean;
        formatEquations: boolean;
    };
    plot: {
        isAdaptive: boolean;
        screenScaleFactor: number;
        imagePath: string;
        imageUri: string;
        vectorGraphics: boolean;
        colorScale: string;
        smoothScale: boolean;
        shadows: boolean;
        lightDirection: string;
    };
    server: {
        url: string;
    };
    units: string;
    output: {
        format: string;
        silent: boolean;
    };
}

export class CalcpadSettingsManager {
    private static instance: CalcpadSettingsManager;
    private _settings: CalcpadSettings;
    private _onDidChangeSettings = new vscode.EventEmitter<CalcpadSettings>();
    public readonly onDidChangeSettings = this._onDidChangeSettings.event;
    private _context?: vscode.ExtensionContext;

    private constructor(context?: vscode.ExtensionContext) {
        this._settings = this.getDefaultSettings();
        this.loadSettings();
        if (context) {
            this._context = context;
        }
    }

    public static getInstance(context?: vscode.ExtensionContext): CalcpadSettingsManager {
        if (!CalcpadSettingsManager.instance) {
            CalcpadSettingsManager.instance = new CalcpadSettingsManager(context);
        }
        if (context && !CalcpadSettingsManager.instance._context) {
            CalcpadSettingsManager.instance._context = context;
        }
        return CalcpadSettingsManager.instance;
    }

    public getDefaultSettings(): CalcpadSettings {
        return {
            math: {
                decimals: 6,
                degrees: 0,
                isComplex: false,
                substitute: true,
                formatEquations: true
            },
            plot: {
                isAdaptive: true,
                screenScaleFactor: 2,
                imagePath: "",
                imageUri: "",
                vectorGraphics: false,
                colorScale: "Rainbow",
                smoothScale: false,
                shadows: true,
                lightDirection: "NorthWest"
            },
            server: {
                url: "http://localhost:9420"
            },
            units: "m",
            output: {
                format: "html",
                silent: true
            }
        };
    }

    public getSettings(): CalcpadSettings {
        return { ...this._settings };
    }

    public updateSettings(newSettings: Partial<CalcpadSettings>): void {
        this._settings = { ...this._settings, ...newSettings };
        this.saveSettings();
        this._onDidChangeSettings.fire(this._settings);
    }


    public resetSettings(): void {
        this._settings = this.getDefaultSettings();
        this.saveSettings();
        this._onDidChangeSettings.fire(this._settings);
    }

    private loadSettings(): void {
        const config = vscode.workspace.getConfiguration('calcpad');
        const savedSettings = config.get<CalcpadSettings>('settings');
        if (savedSettings) {
            this._settings = { ...this.getDefaultSettings(), ...savedSettings };
        }
    }

    private saveSettings(): void {
        const config = vscode.workspace.getConfiguration('calcpad');
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`[Settings] Saving settings: ${JSON.stringify(this._settings, null, 2)}`);
        config.update('settings', this._settings, vscode.ConfigurationTarget.Workspace);
        outputChannel.appendLine(`[Settings] Settings saved to workspace configuration`);
    }

    public async getStoredS3JWT(): Promise<string> {
        if (!this._context) {
            const outputChannel = getOutputChannel();
            outputChannel.appendLine('Warning: Extension context not available for S3 JWT retrieval');
            return '';
        }
        
        const jwt = await this._context.secrets.get('calcpad.s3.jwt') || '';
        
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`Getting stored S3 JWT: ${jwt ? `${jwt.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`S3 JWT length: ${jwt ? jwt.length : 0}`);
        
        return jwt;
    }

    private static getColorScaleEnumValue(colorScale: string): number {
        const colorScaleMap: Record<string, number> = {
            "None": 0,
            "Gray": 1,
            "Rainbow": 2,
            "Terrain": 3,
            "VioletToYellow": 4,
            "GreenToYellow": 5,
            "Blues": 6,
            "BlueToYellow": 7,
            "BlueToRed": 8,
            "PurpleToYellow": 9
        };
        return colorScaleMap[colorScale] !== undefined ? colorScaleMap[colorScale] : 2; // Default to Rainbow
    }

    private static getLightDirectionEnumValue(lightDirection: string): number {
        const lightDirectionMap: Record<string, number> = {
            "North": 0,
            "NorthEast": 1,
            "East": 2,
            "SouthEast": 3,
            "South": 4,
            "SouthWest": 5,
            "West": 6,
            "NorthWest": 7
        };
        return lightDirectionMap[lightDirection] !== undefined ? lightDirectionMap[lightDirection] : 7; // Default to NorthWest
    }

    private static getS3ConfigPath(): string {
        const path = require('path');
        return path.join(__dirname, 's3-config.json');
    }

    public async getApiSettings(): Promise<unknown> {
        const storedS3JWT = await this.getStoredS3JWT();

        // Read S3 URL from centralized config
        const path = require('path');
        const fs = require('fs');
        const configPath = CalcpadSettingsManager.getS3ConfigPath();
        const configContent = fs.readFileSync(configPath, 'utf8');
        const configData = JSON.parse(configContent);

        if (!configData.apiBaseUrl) {
            throw new Error('apiBaseUrl not found in s3-config.json');
        }

        const s3ApiUrl = configData.apiBaseUrl;

        const apiSettings = {
            math: {
                decimals: this._settings.math.decimals,
                degrees: this._settings.math.degrees,
                isComplex: this._settings.math.isComplex,
                substitute: this._settings.math.substitute,
                formatEquations: this._settings.math.formatEquations
            },
            plot: {
                isAdaptive: this._settings.plot.isAdaptive,
                screenScaleFactor: this._settings.plot.screenScaleFactor,
                imagePath: this._settings.plot.imagePath,
                imageUri: this._settings.plot.imageUri,
                vectorGraphics: this._settings.plot.vectorGraphics,
                colorScale: CalcpadSettingsManager.getColorScaleEnumValue(this._settings.plot.colorScale),
                smoothScale: this._settings.plot.smoothScale,
                shadows: this._settings.plot.shadows,
                lightDirection: CalcpadSettingsManager.getLightDirectionEnumValue(this._settings.plot.lightDirection)
            },
            auth: {
                url: s3ApiUrl,
                jwt: storedS3JWT
            },
            units: this._settings.units,
            output: {
                format: this._settings.output.format,
                silent: this._settings.output.silent
            }
        };

        // Debug logging
        const outputChannel = getOutputChannel();
        outputChannel.appendLine('API settings being sent:');
        outputChannel.appendLine(`  S3 Storage URL: ${s3ApiUrl}`);
        outputChannel.appendLine(`  S3 JWT: ${storedS3JWT ? `${storedS3JWT.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`  S3 JWT Length: ${storedS3JWT ? storedS3JWT.length : 0}`);
        outputChannel.appendLine(`  ColorScale: "${this._settings.plot.colorScale}" -> ${CalcpadSettingsManager.getColorScaleEnumValue(this._settings.plot.colorScale)}`);
        outputChannel.appendLine(`  LightDirection: "${this._settings.plot.lightDirection}" -> ${CalcpadSettingsManager.getLightDirectionEnumValue(this._settings.plot.lightDirection)}`);

        return apiSettings;
    }
}