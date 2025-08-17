import * as vscode from 'vscode';
import * as settingsSchema from './calcpad-settings-schema.json';

let _outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('CalcPad');
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
    auth: {
        loginUrl: string;
        storageUrl: string;
        username: string;
        password: string;
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
            auth: {
                loginUrl: "",
                storageUrl: "",
                username: "",
                password: ""
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
        config.update('settings', this._settings, vscode.ConfigurationTarget.Workspace);
    }

    public async getStoredJWT(): Promise<string> {
        if (!this._context) {
            const outputChannel = getOutputChannel();
            outputChannel.appendLine('Warning: Extension context not available for JWT retrieval');
            return '';
        }
        
        const jwt = await this._context.secrets.get('calcpad.auth.jwt') || '';
        
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`Getting stored JWT: ${jwt ? `${jwt.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`JWT length: ${jwt ? jwt.length : 0}`);
        
        return jwt;
    }

    public async setStoredJWT(jwt: string): Promise<void> {
        if (!this._context) {
            const outputChannel = getOutputChannel();
            outputChannel.appendLine('Warning: Extension context not available for JWT storage');
            return;
        }
        
        await this._context.secrets.store('calcpad.auth.jwt', jwt);
        
        const outputChannel = getOutputChannel();
        outputChannel.appendLine(`JWT stored securely: ${jwt ? `${jwt.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`JWT length: ${jwt ? jwt.length : 0}`);
    }

    public async getApiSettings(): Promise<unknown> {
        const storedJWT = await this.getStoredJWT();
        const apiSettings = {
            math: {
                decimals: this._settings.math.decimals,
                degrees: this._settings.math.degrees,
                isComplex: this._settings.math.isComplex,
                substitute: this._settings.math.substitute,
                formatEquations: this._settings.math.formatEquations
            },
            plot: {
                colorScale: this._settings.plot.colorScale,
                lightDirection: this._settings.plot.lightDirection,
                shadows: this._settings.plot.shadows,
                vectorGraphics: this._settings.plot.vectorGraphics
            },
            auth: {
                url: this._settings.auth.storageUrl,
                jwt: storedJWT
            },
            units: this._settings.units,
            output: {
                format: this._settings.output.format
            }
        };
        
        // Debug logging
        const outputChannel = getOutputChannel();
        outputChannel.appendLine('Auth settings being sent:');
        outputChannel.appendLine(`  Storage URL: ${this._settings.auth.storageUrl}`);
        outputChannel.appendLine(`  JWT: ${storedJWT ? `${storedJWT.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`  JWT Length: ${storedJWT ? storedJWT.length : 0}`);
        
        return apiSettings;
    }
}