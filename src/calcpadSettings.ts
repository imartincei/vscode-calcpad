import * as vscode from 'vscode';

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
        zeroSmallMatrixElements: boolean;
        maxOutputCount: number;
        formatString: string;
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
                decimals: 2,
                degrees: 0,
                isComplex: false,
                substitute: true,
                formatEquations: true,
                zeroSmallMatrixElements: true,
                maxOutputCount: 20,
                formatString: ""
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
            units: "m"
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

    private colorScaleToEnum(colorScale: string): number {
        const colorScaleMap: Record<string, number> = {
            'Rainbow': 0,
            'Grayscale': 1,
            'Hot': 2,
            'Cool': 3,
            'Jet': 4,
            'Parula': 5
        };
        return colorScaleMap[colorScale] ?? 0;
    }

    private lightDirectionToEnum(direction: string): number {
        const directionMap: Record<string, number> = {
            'NorthWest': 0,
            'North': 1,
            'NorthEast': 2,
            'West': 3,
            'East': 4,
            'SouthWest': 5,
            'South': 6,
            'SouthEast': 7
        };
        return directionMap[direction] ?? 0;
    }

    public async getApiSettings(): Promise<unknown> {
        const storedS3JWT = await this.getStoredS3JWT();

        // Read S3 URL and routing config from VS Code settings
        const config = vscode.workspace.getConfiguration('calcpad');
        const s3ApiUrl = config.get<string>('s3.apiUrl');
        const routingConfig = config.get<unknown>('routing.config');

        if (!s3ApiUrl) {
            throw new Error('calcpad.s3.apiUrl not found in VS Code settings');
        }

        const apiSettings = {
            math: {
                decimals: this._settings.math.decimals,
                degrees: this._settings.math.degrees,
                isComplex: this._settings.math.isComplex,
                substitute: this._settings.math.substitute,
                formatEquations: this._settings.math.formatEquations,
                zeroSmallMatrixElements: this._settings.math.zeroSmallMatrixElements,
                maxOutputCount: this._settings.math.maxOutputCount,
                formatString: this._settings.math.formatString
            },
            plot: {
                isAdaptive: this._settings.plot.isAdaptive,
                screenScaleFactor: this._settings.plot.screenScaleFactor,
                imagePath: this._settings.plot.imagePath,
                imageUri: this._settings.plot.imageUri,
                vectorGraphics: this._settings.plot.vectorGraphics,
                colorScale: this.colorScaleToEnum(this._settings.plot.colorScale),
                smoothScale: this._settings.plot.smoothScale,
                shadows: this._settings.plot.shadows,
                lightDirection: this.lightDirectionToEnum(this._settings.plot.lightDirection)
            },
            auth: {
                url: s3ApiUrl,
                jwt: storedS3JWT,
                routingConfig: routingConfig || null
            },
            units: this._settings.units
        };

        // Debug logging
        const outputChannel = getOutputChannel();
        outputChannel.appendLine('API settings being sent:');
        outputChannel.appendLine(`  S3 Storage URL: ${s3ApiUrl}`);
        outputChannel.appendLine(`  S3 JWT: ${storedS3JWT ? `${storedS3JWT.substring(0, 20)}...` : 'EMPTY'}`);
        outputChannel.appendLine(`  S3 JWT Length: ${storedS3JWT ? storedS3JWT.length : 0}`);
        outputChannel.appendLine(`  ColorScale: "${this._settings.plot.colorScale}" -> ${apiSettings.plot.colorScale}`);
        outputChannel.appendLine(`  LightDirection: "${this._settings.plot.lightDirection}" -> ${apiSettings.plot.lightDirection}`);

        return apiSettings;
    }
}