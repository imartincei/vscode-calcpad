import * as vscode from 'vscode';
import * as settingsSchema from './calcpad-settings-schema.json';

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

    private constructor() {
        this._settings = this.getDefaultSettings();
        this.loadSettings();
    }

    public static getInstance(): CalcpadSettingsManager {
        if (!CalcpadSettingsManager.instance) {
            CalcpadSettingsManager.instance = new CalcpadSettingsManager();
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

    public getApiSettings(): unknown {
        return {
            math: {
                decimals: this._settings.math.decimals,
                degrees: this._settings.math.degrees,
                substitute: this._settings.math.substitute
            },
            plot: {
                colorScale: this._settings.plot.colorScale,
                shadows: this._settings.plot.shadows
            },
            units: this._settings.units,
            output: {
                format: this._settings.output.format,
                silent: this._settings.output.silent
            }
        };
    }
}