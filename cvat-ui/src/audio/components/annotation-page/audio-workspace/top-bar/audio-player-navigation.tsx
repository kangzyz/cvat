// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Row, Col } from 'antd/lib/grid';
import Icon from '@ant-design/icons';

import { Workspace } from 'reducers';
import i18n from 'i18n';
import GlobalHotKeys, { KeyMap } from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { subKeyMap } from 'utils/component-subkeymap';
import CVATTooltip from 'components/common/cvat-tooltip';
import {
    BackJumpIcon, FirstIcon, ForwardJumpIcon, LastIcon,
    NextIcon, PauseIcon, PlayIcon, PreviousIcon,
} from 'icons';

const AUDIO_SHORT_JUMP_FRACTION = 0.005;
const AUDIO_LONG_JUMP_FRACTION = 0.05;

interface Props {
    playing: boolean;
    currentTime: number;
    duration: number;
    zoom: number;
    workspace: Workspace;
    keyMap: KeyMap;
    onPlayPause(): void;
    onSeek(time: number): void;
}

const componentShortcuts = {
    PLAY_PAUSE_AUDIO: {
        name: i18n.t('audioPlugins:audio.topBar.playPauseName'),
        description: i18n.t('audioPlugins:audio.topBar.playPauseDescription'),
        sequences: ['space'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    AUDIO_BACKWARD: {
        name: i18n.t('audioPlugins:audio.topBar.backwardName'),
        description: i18n.t('audioPlugins:audio.topBar.backwardDescription'),
        sequences: ['d'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    AUDIO_FORWARD: {
        name: i18n.t('audioPlugins:audio.topBar.forwardName'),
        description: i18n.t('audioPlugins:audio.topBar.forwardDescription'),
        sequences: ['f'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    AUDIO_FAST_BACKWARD: {
        name: i18n.t('audioPlugins:audio.topBar.fastBackwardName'),
        description: i18n.t('audioPlugins:audio.topBar.fastBackwardDescription'),
        sequences: ['c'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    AUDIO_FAST_FORWARD: {
        name: i18n.t('audioPlugins:audio.topBar.fastForwardName'),
        description: i18n.t('audioPlugins:audio.topBar.fastForwardDescription'),
        sequences: ['v'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
};

registerComponentShortcuts(componentShortcuts);

type SeekButton = {
    title: string;
    className: string;
    icon: React.ComponentType;
    getTarget(currentTime: number, duration: number, shortJump: number, longJump: number): number;
};

const LEFT_BUTTONS: SeekButton[] = [
    {
        title: i18n.t('audioPlugins:audio.topBar.jumpToStart'),
        className: 'cvat-player-begin-button',
        icon: FirstIcon,
        getTarget: () => 0,
    },
    {
        title: i18n.t('audioPlugins:audio.topBar.longBackward'),
        className: 'cvat-player-long-jump-backward-button',
        icon: BackJumpIcon,
        getTarget: (t, _duration, _shortJump, longJump) => t - longJump,
    },
    {
        title: i18n.t('audioPlugins:audio.topBar.shortBackward'),
        className: 'cvat-player-short-jump-backward-button',
        icon: PreviousIcon,
        getTarget: (t, _duration, shortJump) => t - shortJump,
    },
];

const RIGHT_BUTTONS: SeekButton[] = [
    {
        title: i18n.t('audioPlugins:audio.topBar.shortForward'),
        className: 'cvat-player-short-jump-forward-button',
        icon: NextIcon,
        getTarget: (t, _duration, shortJump) => t + shortJump,
    },
    {
        title: i18n.t('audioPlugins:audio.topBar.longForward'),
        className: 'cvat-player-long-jump-forward-button',
        icon: ForwardJumpIcon,
        getTarget: (t, _duration, _shortJump, longJump) => t + longJump,
    },
    {
        title: i18n.t('audioPlugins:audio.topBar.jumpToEnd'),
        className: 'cvat-player-end-button',
        icon: LastIcon,
        getTarget: (_, d) => d,
    },
];

function computeJumpSize(duration: number, zoom: number, fraction: number): number {
    if (duration <= 0) return 0;
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    return (duration / safeZoom) * fraction;
}

function AudioPlayerNavigation(props: Props): JSX.Element {
    const {
        playing,
        currentTime,
        duration,
        zoom,
        workspace,
        keyMap,
        onPlayPause,
        onSeek,
    } = props;

    const isAudioLoaded = duration > 0;
    const shortJump = computeJumpSize(duration, zoom, AUDIO_SHORT_JUMP_FRACTION);
    const longJump = computeJumpSize(duration, zoom, AUDIO_LONG_JUMP_FRACTION);
    const seekTo = (time: number): void => {
        if (!isAudioLoaded) return;

        const clampedTime = Math.max(0, Math.min(duration, time));
        onSeek(clampedTime);
    };

    const hotkeyHandlers: { [key: string]: (event: KeyboardEvent) => void } = {
        PLAY_PAUSE_AUDIO: (event: KeyboardEvent) => {
            event.preventDefault();
            if (workspace === Workspace.AUDIO) {
                onPlayPause();
            }
        },
        AUDIO_BACKWARD: (event: KeyboardEvent) => {
            event.preventDefault();
            if (workspace === Workspace.AUDIO) {
                seekTo(currentTime - shortJump);
            }
        },
        AUDIO_FORWARD: (event: KeyboardEvent) => {
            event.preventDefault();
            if (workspace === Workspace.AUDIO) {
                seekTo(currentTime + shortJump);
            }
        },
        AUDIO_FAST_BACKWARD: (event: KeyboardEvent) => {
            event.preventDefault();
            if (workspace === Workspace.AUDIO) {
                seekTo(currentTime - longJump);
            }
        },
        AUDIO_FAST_FORWARD: (event: KeyboardEvent) => {
            event.preventDefault();
            if (workspace === Workspace.AUDIO) {
                seekTo(currentTime + longJump);
            }
        },
    };

    const renderSeekButton = ({
        title, icon, getTarget, className,
    }: SeekButton): JSX.Element => (
        <CVATTooltip key={title} title={title}>
            <Icon
                className={className}
                component={icon}
                onClick={() => seekTo(getTarget(currentTime, duration, shortJump, longJump))}
                disabled={!isAudioLoaded}
            />
        </CVATTooltip>
    );

    const blockStyle = isAudioLoaded ? {} : {
        pointerEvents: 'none',
        cursor: 'not-allowed',
    } as const;

    return (
        <>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={hotkeyHandlers} />
            <Row align='middle' justify='center'>
                <Col>
                    <div style={blockStyle} className='cvat-player-buttons'>
                        {LEFT_BUTTONS.map(renderSeekButton)}
                        <CVATTooltip title={playing ? i18n.t('audioPlugins:audio.topBar.pause') : i18n.t('audioPlugins:audio.topBar.play')}>
                            <Icon
                                className={playing ? 'cvat-player-pause-button' : 'cvat-player-play-button'}
                                component={playing ? PauseIcon : PlayIcon}
                                onClick={onPlayPause}
                                disabled={!isAudioLoaded}
                            />
                        </CVATTooltip>
                        {RIGHT_BUTTONS.map(renderSeekButton)}
                    </div>
                </Col>
            </Row>
        </>
    );
}

export default AudioPlayerNavigation;
