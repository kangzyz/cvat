// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export type LocalYoloDeploymentStatus = 'uploading' | 'deploying' | 'failed';

export interface LocalYoloDeployment {
    localYoloDeployment: true;
    id: string;
    name: string;
    labels: string[];
    status: LocalYoloDeploymentStatus;
    createdAt: string;
    error?: string;
}

export interface LocalYoloDeploymentResponse {
    id: string;
    name: string;
    function_root: string;
    labels: { id: number; name: string; type: string }[];
    stdout?: string;
    stderr?: string;
}

export type LocalYoloDeploymentRequest = Promise<LocalYoloDeploymentResponse>;

const STORAGE_KEY = 'cvat.local-yolo.deployments';

export function makeLocalYoloFunctionName(value: string): string {
    let normalized = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    normalized = normalized.replace(/-{2,}/g, '-');
    if (!normalized) {
        normalized = 'model';
    }

    if (!normalized.startsWith('local-yolo-')) {
        normalized = `local-yolo-${normalized}`;
    }

    return normalized.slice(0, 63).replace(/-+$/g, '');
}

export function parseLocalYoloLabels(value: string): string[] {
    return value
        .split(/[\n,]+/)
        .map((label) => label.trim())
        .filter((label) => !!label);
}

export function readLocalYoloDeployments(): LocalYoloDeployment[] {
    try {
        const value = window.localStorage.getItem(STORAGE_KEY);
        if (!value) {
            return [];
        }

        const deployments = JSON.parse(value);
        if (!Array.isArray(deployments)) {
            return [];
        }

        return deployments.filter((deployment) => (
            deployment &&
            deployment.localYoloDeployment === true &&
            typeof deployment.id === 'string' &&
            typeof deployment.name === 'string' &&
            Array.isArray(deployment.labels) &&
            ['uploading', 'deploying', 'failed'].includes(deployment.status)
        ));
    } catch {
        return [];
    }
}

export function writeLocalYoloDeployments(deployments: LocalYoloDeployment[]): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deployments));
    } catch {
        // Ignore storage failures. The in-memory page state still shows the deployment.
    }
}

export function isLocalYoloDeployment(value: unknown): value is LocalYoloDeployment {
    return !!value && (value as LocalYoloDeployment).localYoloDeployment === true;
}
