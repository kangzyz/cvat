// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Icon from '@ant-design/icons';
import { useSelector } from 'react-redux';

import { CursorIcon } from 'icons';
import { ActiveControl, CombinedState } from 'reducers';
import i18n from 'i18n';
import CVATTooltip from 'components/common/cvat-tooltip';
import GlobalHotKeys from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { subKeyMap } from 'utils/component-subkeymap';

export interface Props {
    cursorShortkey: string;
    activeControl: ActiveControl;
    updateActiveControl(activeControl: ActiveControl): void;
}

const componentShortcuts = {
    CANCEL_AUDIO: {
        name: i18n.t('audioPlugins:audio.controls.cancelName'),
        description: i18n.t('audioPlugins:audio.controls.cancelDescription'),
        sequences: ['esc'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
};

registerComponentShortcuts(componentShortcuts);

function AudioCursorControl(props: Props): JSX.Element {
    const { activeControl, cursorShortkey, updateActiveControl } = props;
    const { keyMap } = useSelector((state: CombinedState) => state.shortcuts);

    const handler = (): void => {
        if (activeControl !== ActiveControl.CURSOR) {
            updateActiveControl(ActiveControl.CURSOR);
        }
    };

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        CANCEL_AUDIO: (event?: KeyboardEvent) => {
            if (event) event.preventDefault();
            handler();
        },
    };

    return (
        <>
            <GlobalHotKeys
                keyMap={subKeyMap(componentShortcuts, keyMap)}
                handlers={handlers}
            />
            <CVATTooltip title={i18n.t('audioPlugins:audio.controls.cursor', { shortcut: cursorShortkey })} placement='right'>
                <Icon
                    component={CursorIcon}
                    className={
                        activeControl === ActiveControl.CURSOR ?
                            'cvat-active-canvas-control cvat-cursor-control' :
                            'cvat-cursor-control'
                    }
                    onClick={handler}
                />
            </CVATTooltip>
        </>
    );
}

export default React.memo(AudioCursorControl);
