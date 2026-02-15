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
        mode: 'auto' | 'local' | 'remote';
    };
    units: string;
}

export function getDefaultSettings(): CalcpadSettings {
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
            url: "http://localhost:9420",
            mode: "auto"
        },
        units: "m"
    };
}

const COLOR_SCALE_MAP: Record<string, number> = {
    'Rainbow': 0,
    'Grayscale': 1,
    'Hot': 2,
    'Cool': 3,
    'Jet': 4,
    'Parula': 5
};

const LIGHT_DIRECTION_MAP: Record<string, number> = {
    'NorthWest': 0,
    'North': 1,
    'NorthEast': 2,
    'West': 3,
    'East': 4,
    'SouthWest': 5,
    'South': 6,
    'SouthEast': 7
};

export function colorScaleToEnum(colorScale: string): number {
    return COLOR_SCALE_MAP[colorScale] ?? 0;
}

export function lightDirectionToEnum(direction: string): number {
    return LIGHT_DIRECTION_MAP[direction] ?? 0;
}

export function buildApiSettings(settings: CalcpadSettings, jwt: string = ''): unknown {
    return {
        math: { ...settings.math },
        plot: {
            ...settings.plot,
            colorScale: colorScaleToEnum(settings.plot.colorScale),
            lightDirection: lightDirectionToEnum(settings.plot.lightDirection)
        },
        auth: {
            url: settings.server.url,
            jwt
        },
        units: settings.units
    };
}
