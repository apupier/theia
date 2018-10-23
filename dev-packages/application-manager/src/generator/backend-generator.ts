/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { AbstractGenerator } from './abstract-generator';

export class BackendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const backendModules = this.pck.targetBackendModules;
        await this.write(this.pck.backend('server.js'), this.compileServer(backendModules));
        await this.write(this.pck.backend('main.js'), this.compileMain(backendModules));
    }

    protected compileServer(backendModules: Map<string, string>): string {
        return `// @ts-check
require('reflect-metadata');
const path = require('path');
const express = require('express');
const { Container, injectable } = require('inversify');

const { BackendApplication, CliManager } = require('@theia/core/lib/node');
const { backendApplicationModule } = require('@theia/core/lib/node/backend-application-module');
const { messagingBackendModule } = require('@theia/core/lib/node/messaging/messaging-backend-module');
const { loggerBackendModule } = require('@theia/core/lib/node/logger-backend-module');

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start(port, host) {
    const cliManager = container.get(CliManager);
    return cliManager.initializeCli().then(function () {
        const application = container.get(BackendApplication);
        application.use(express.static(path.join(__dirname, '../../lib'), {
            index: 'index.html'
        }));
        return application.start(port, host);
    });
}

module.exports = (port, host) => Promise.resolve()${this.compileBackendModuleImports(backendModules)}
    .then(() => start(port, host)).catch(reason => {
        console.error('Failed to start the backend application.');
        if (reason) {
            console.error(reason);
        }
        throw reason;
    });`;
    }

    protected compileMain(backendModules: Map<string, string>): string {
        const setElectronVersion = this.ifElectron(`
// To be able to identify whether we are running in electron or not (is-electron), we need the electron version on the process.
// For the forked Node.js processes, it is missing, so we have to set it explicitly.
// https://github.com/theia-ide/theia/issues/3254#issuecomment-432206760
if (process.versions && typeof process.versions.electron === 'undefined') {
    const argv = process.argv.splice(2);
    const index = argv.findIndex(arg => arg.startsWith('electron-version='));
    if (index !== -1) {
        process.versions.electron = argv[index].split('electron-version=').pop();
    }
}
`);
        return `// @ts-check
const { BackendApplicationConfigProvider } = require('@theia/core/lib/node/backend-application-config-provider');
BackendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.backend.config)});
${setElectronVersion}
const serverPath = require('path').resolve(__dirname, 'server');
const address = require('@theia/core/lib/node/cluster/main').default(serverPath);
address.then(function (address) {
    if (process && process.send) {
        process.send(address.port.toString());
    }
});
module.exports = address;
`;
    }

}
