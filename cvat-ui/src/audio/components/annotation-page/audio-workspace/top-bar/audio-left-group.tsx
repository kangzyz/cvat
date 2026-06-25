// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Col } from 'antd/lib/grid';
import Icon, { LoadingOutlined } from '@ant-design/icons';
import Modal from 'antd/lib/modal';
import Button from 'antd/lib/button';
import Text from 'antd/lib/typography/Text';

import { UndoIcon, RedoIcon } from 'icons';
import i18n from 'i18n';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import AnnotationMenuComponent from 'components/annotation-page/top-bar/annotation-menu';
import CVATTooltip from 'components/common/cvat-tooltip';
import { ShortcutScope } from 'utils/enums';
import { subKeyMap } from 'utils/component-subkeymap';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import AudioSaveAnnotationsButton from './audio-save-annotations-button';
import AudioRemoveAnnotationsConfirm from './audio-remove-annotations-confirm';

interface Props {
    saving: boolean;
    undoAction?: string;
    redoAction?: string;
    undoShortcut: string;
    redoShortcut: string;
    keyMap: KeyMap;
    onUndoClick(): void;
    onRedoClick(): void;
}

const componentShortcuts = {
    AUDIO_UNDO: {
        name: i18n.t('audioPlugins:audio.topBar.undoName'),
        description: i18n.t('audioPlugins:audio.topBar.undoDescription'),
        sequences: ['ctrl+z'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    AUDIO_REDO: {
        name: i18n.t('audioPlugins:audio.topBar.redoName'),
        description: i18n.t('audioPlugins:audio.topBar.redoDescription'),
        sequences: ['ctrl+shift+z', 'ctrl+y'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
};

registerComponentShortcuts(componentShortcuts);

function AudioLeftGroup(props: Props): JSX.Element {
    const {
        saving,
        keyMap,
        undoAction,
        redoAction,
        undoShortcut,
        redoShortcut,
        onUndoClick,
        onRedoClick,
    } = props;

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        AUDIO_UNDO: (event: KeyboardEvent | undefined) => {
            event?.preventDefault();
            if (undoAction) {
                onUndoClick();
            }
        },
        AUDIO_REDO: (event: KeyboardEvent | undefined) => {
            event?.preventDefault();
            if (redoAction) {
                onRedoClick();
            }
        },
    };

    return (
        <>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            { saving && (
                <Modal
                    open
                    destroyOnClose
                    className='cvat-saving-job-modal'
                    closable={false}
                    footer={[]}
                >
                    <Text>{i18n.t('audioPlugins:audio.topBar.savingAnnotations')} </Text>
                    <LoadingOutlined />
                </Modal>
            )}
            <Col className='cvat-annotation-header-left-group'>
                <AnnotationMenuComponent removeAnnotationsConfirmComponent={AudioRemoveAnnotationsConfirm} />
                <AudioSaveAnnotationsButton />
                <CVATTooltip overlay={i18n.t('audioPlugins:audio.topBar.undoTooltip', { action: undoAction, shortcut: undoShortcut })}>
                    <Button
                        style={{ pointerEvents: undoAction ? 'initial' : 'none', opacity: undoAction ? 1 : 0.5 }}
                        type='link'
                        className='cvat-annotation-header-undo-button cvat-annotation-header-button'
                        onClick={onUndoClick}
                    >
                        <Icon component={UndoIcon} />
                        <span>{i18n.t('audioPlugins:audio.topBar.undo')}</span>
                    </Button>
                </CVATTooltip>
                <CVATTooltip overlay={i18n.t('audioPlugins:audio.topBar.redoTooltip', { action: redoAction, shortcut: redoShortcut })}>
                    <Button
                        style={{ pointerEvents: redoAction ? 'initial' : 'none', opacity: redoAction ? 1 : 0.5 }}
                        type='link'
                        className='cvat-annotation-header-redo-button cvat-annotation-header-button'
                        onClick={onRedoClick}
                    >
                        <Icon component={RedoIcon} />
                        {i18n.t('audioPlugins:audio.topBar.redo')}
                    </Button>
                </CVATTooltip>
            </Col>
        </>
    );
}

export default React.memo(AudioLeftGroup);
