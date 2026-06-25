// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { DashboardOutlined } from '@ant-design/icons';

import i18n from 'i18n';
import AudioSliderControl from './audio-slider-control';

export interface Props {
    playbackRate: number;
    onPlaybackRateChange(rate: number): void;
}

function SpeedControl(props: Props): JSX.Element {
    const { playbackRate, onPlaybackRateChange } = props;

    return (
        <AudioSliderControl
            icon={<DashboardOutlined />}
            tooltip={i18n.t('audioPlugins:audio.controls.speed')}
            value={playbackRate}
            min={0.1}
            max={4}
            step={0.1}
            formatValue={(v) => `${v.toFixed(1)}x`}
            className='cvat-audio-speed-control'
            valueBadge={`${playbackRate.toFixed(1)}x`}
            onChange={onPlaybackRateChange}
        />
    );
}

export default React.memo(SpeedControl);
