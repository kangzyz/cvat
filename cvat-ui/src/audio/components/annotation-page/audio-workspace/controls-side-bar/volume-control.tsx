// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { SoundOutlined } from '@ant-design/icons';

import i18n from 'i18n';
import AudioSliderControl from './audio-slider-control';

export interface Props {
    volume: number;
    onVolumeChange(volume: number): void;
}

function VolumeControl(props: Props): JSX.Element {
    const { volume, onVolumeChange } = props;

    return (
        <AudioSliderControl
            icon={<SoundOutlined />}
            tooltip={i18n.t('audioPlugins:audio.controls.volume')}
            value={volume}
            min={0}
            max={1}
            step={0.01}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            className='cvat-audio-volume-control'
            valueBadge={`${Math.round(volume * 100)}%`}
            onChange={onVolumeChange}
        />
    );
}

export default React.memo(VolumeControl);
