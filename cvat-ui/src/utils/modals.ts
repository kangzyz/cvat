// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import Modal from 'antd/lib/modal';

import { Organization, Project, Task } from 'cvat-core-wrapper';
import i18n from 'i18n';

export function confirmTransferModal(
    instances: Project[] | Task[],
    activeWorkspace: Organization | null,
    dstWorkspace: Organization | null,
    onOk: () => void,
): void {
    const first = instances[0];
    if (!first) {
        return;
    }

    const instanceType = first instanceof Task ? i18n.t('common:terms.task') : i18n.t('common:terms.project');
    const movingItems = instances.length > 1 ?
        i18n.t('common:transferModal.multipleResources', { count: instances.length, type: instanceType }) :
        i18n.t('common:transferModal.singleResource', { type: instanceType, id: first.id });
    const destination = dstWorkspace ?
        i18n.t('common:transferModal.organizationWorkspace', { organization: dstWorkspace.slug }) :
        i18n.t('common:transferModal.personalWorkspace');
    let details = `${i18n.t('common:transferModal.moveDetails', { items: movingItems, destination })} `;
    if (activeWorkspace) {
        details += i18n.t('common:transferModal.membersLoseAccess', {
            resources: instances.length > 1 ?
                i18n.t('common:transferModal.theseResources') :
                i18n.t('common:transferModal.thisResource'),
        });
    }

    Modal.confirm({
        title: i18n.t('common:transferModal.title'),
        content: `${details} ${i18n.t('common:transferModal.proceedQuestion')}`,
        className: 'cvat-modal-confirm-project-transfer-between-workspaces',
        onOk,
        okButtonProps: {
            type: 'primary',
            danger: true,
        },
        okText: i18n.t('common:actions.continue'),
    });
}
