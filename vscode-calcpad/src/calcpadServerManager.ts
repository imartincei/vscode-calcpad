import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { CalcpadServerManager as BaseServerManager } from 'calcpad-frontend';
import { VSCodeLogger } from './adapters';

const SKIASHARP_VERSION = '3.119.1';

interface PlatformNativeInfo {
    nugetPackage: string;
    rid: string;
    nativeFileName: string;
}

function getPlatformNativeInfo(): PlatformNativeInfo | null {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'linux' && arch === 'x64') {
        return {
            nugetPackage: 'SkiaSharp.NativeAssets.Linux',
            rid: 'linux-x64',
            nativeFileName: 'libSkiaSharp.so'
        };
    } else if (platform === 'win32' && arch === 'x64') {
        return {
            nugetPackage: 'SkiaSharp.NativeAssets.Win32',
            rid: 'win-x64',
            nativeFileName: 'libSkiaSharp.dll'
        };
    } else if (platform === 'win32' && arch === 'arm64') {
        return {
            nugetPackage: 'SkiaSharp.NativeAssets.Win32',
            rid: 'win-arm64',
            nativeFileName: 'libSkiaSharp.dll'
        };
    } else if (platform === 'darwin' && arch === 'x64') {
        return {
            nugetPackage: 'SkiaSharp.NativeAssets.macOS',
            rid: 'osx-x64',
            nativeFileName: 'libSkiaSharp.dylib'
        };
    } else if (platform === 'darwin' && arch === 'arm64') {
        return {
            nugetPackage: 'SkiaSharp.NativeAssets.macOS',
            rid: 'osx-arm64',
            nativeFileName: 'libSkiaSharp.dylib'
        };
    }

    return null;
}

/**
 * VS Code extension server manager that extends the base CalcpadServerManager
 * with SkiaSharp native library management and VS Code progress notifications.
 */
export class CalcpadServerManager extends BaseServerManager implements vscode.Disposable {
    private extensionPath: string;
    private outputChannel: vscode.OutputChannel;

    constructor(extensionPath: string, outputChannel: vscode.OutputChannel, dotnetPath: string = 'dotnet') {
        super(extensionPath, new VSCodeLogger(outputChannel), dotnetPath);
        this.extensionPath = extensionPath;
        this.outputChannel = outputChannel;
    }

    public override async start(): Promise<void> {
        await this.ensureNativeLibs();
        return super.start();
    }

    private async ensureNativeLibs(): Promise<void> {
        const info = getPlatformNativeInfo();
        if (!info) {
            this.outputChannel.appendLine(`[ServerManager] Unsupported platform: ${process.platform}-${process.arch}`);
            throw new Error(`Unsupported platform: ${process.platform}-${process.arch}. Cannot resolve SkiaSharp native library.`);
        }

        const binDir = path.join(this.extensionPath, 'bin');
        const nativeDir = path.join(binDir, 'runtimes', info.rid, 'native');
        const nativeLibPath = path.join(nativeDir, info.nativeFileName);

        if (fs.existsSync(nativeLibPath)) {
            this.outputChannel.appendLine(`[ServerManager] Native lib already present: ${nativeLibPath}`);
            return;
        }

        this.outputChannel.appendLine(`[ServerManager] Native lib missing for ${info.rid}, downloading from NuGet...`);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'CalcPad: Downloading native libraries...',
            cancellable: false
        }, async (progress) => {
            await this.downloadNativeLib(info, binDir, progress);
        });
    }

    private async downloadNativeLib(
        info: PlatformNativeInfo,
        binDir: string,
        progress: vscode.Progress<{ increment?: number; message?: string }>
    ): Promise<void> {
        const nugetUrl = `https://www.nuget.org/api/v2/package/${info.nugetPackage}/${SKIASHARP_VERSION}`;
        this.outputChannel.appendLine(`[ServerManager] Downloading ${info.nugetPackage} v${SKIASHARP_VERSION} from ${nugetUrl}`);

        progress.report({ message: `Downloading ${info.nugetPackage}...` });

        const response = await fetch(nugetUrl, { redirect: 'follow' });
        if (!response.ok) {
            throw new Error(`Failed to download ${info.nugetPackage}: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const tmpDir = path.join(binDir, '.tmp-nupkg');
        fs.mkdirSync(tmpDir, { recursive: true });
        const nupkgPath = path.join(tmpDir, 'package.nupkg');
        fs.writeFileSync(nupkgPath, buffer);

        this.outputChannel.appendLine(`[ServerManager] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
        progress.report({ message: 'Extracting native library...' });

        const extractDir = path.join(tmpDir, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });

        try {
            if (process.platform === 'win32') {
                execSync(
                    `powershell -NoProfile -Command "Expand-Archive -Path '${nupkgPath}' -DestinationPath '${extractDir}' -Force"`,
                    { timeout: 60000 }
                );
            } else {
                execSync(`unzip -o "${nupkgPath}" -d "${extractDir}"`, { timeout: 60000 });
            }
        } catch (err) {
            throw new Error(`Failed to extract nupkg: ${err instanceof Error ? err.message : String(err)}`);
        }

        const ridSearchOrder = [info.rid];
        if (info.rid.startsWith('osx-')) {
            ridSearchOrder.push('osx');
        }

        let sourceFile: string | null = null;
        for (const rid of ridSearchOrder) {
            const candidate = path.join(extractDir, 'runtimes', rid, 'native', info.nativeFileName);
            if (fs.existsSync(candidate)) {
                sourceFile = candidate;
                break;
            }
        }

        if (!sourceFile) {
            const runtimesDir = path.join(extractDir, 'runtimes');
            if (fs.existsSync(runtimesDir)) {
                const contents = fs.readdirSync(runtimesDir);
                this.outputChannel.appendLine(`[ServerManager] Available RIDs in package: ${contents.join(', ')}`);
            }
            throw new Error(`Native lib ${info.nativeFileName} not found in package for RID ${info.rid}`);
        }

        const targetDir = path.join(binDir, 'runtimes', info.rid, 'native');
        fs.mkdirSync(targetDir, { recursive: true });

        const targetPath = path.join(targetDir, info.nativeFileName);
        fs.copyFileSync(sourceFile, targetPath);

        if (process.platform !== 'win32') {
            fs.chmodSync(targetPath, 0o755);
        }

        this.outputChannel.appendLine(`[ServerManager] Native lib installed: ${targetPath}`);
        progress.report({ message: 'Done!' });

        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            this.outputChannel.appendLine('[ServerManager] Warning: Could not clean up temp directory');
        }
    }
}
