// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';
import InputNumber from 'antd/lib/input-number';
import Collapse from 'antd/lib/collapse';

import i18n from 'i18n';
import type { RemoveAnnotationsConfirmProps } from 'components/annotation-page/top-bar/remove-annotations-confirm';

type TimeValue = {
    minutes?: number;
    seconds?: number;
    milliseconds?: number;
};

function timeToMilliseconds(value: TimeValue): number | undefined {
    const hasValue = (
        typeof value.minutes === 'number' ||
        typeof value.seconds === 'number' ||
        typeof value.milliseconds === 'number'
    );
    if (!hasValue) return undefined;

    return (value.minutes ?? 0) * 60 * 1000 + (value.seconds ?? 0) * 1000 + (value.milliseconds ?? 0);
}

function AudioTimeInput({
    label,
    value,
    onChange,
}: {
    label: string;
    value: TimeValue;
    onChange(value: TimeValue): void;
}): JSX.Element {
    return (
        <div className='cvat-audio-remove-annotations-time-row'>
            <Text className='cvat-audio-remove-annotations-time-label'>{`${label}:`}</Text>
            <InputNumber
                min={0}
                placeholder={i18n.t('audioPlugins:audio.topBar.minutesPlaceholder')}
                className='cvat-audio-remove-annotations-time-input'
                value={value.minutes}
                onChange={(minutes) => onChange({ ...value, minutes: minutes ?? undefined })}
            />
            <Text className='cvat-audio-remove-annotations-time-separator'>:</Text>
            <InputNumber
                min={0}
                max={59}
                placeholder={i18n.t('audioPlugins:audio.topBar.secondsPlaceholder')}
                className='cvat-audio-remove-annotations-time-input'
                value={value.seconds}
                onChange={(seconds) => onChange({ ...value, seconds: seconds ?? undefined })}
            />
            <Text className='cvat-audio-remove-annotations-time-separator'>:</Text>
            <InputNumber
                min={0}
                max={999}
                placeholder={i18n.t('audioPlugins:audio.topBar.millisecondsPlaceholder')}
                className='cvat-audio-remove-annotations-time-input'
                value={value.milliseconds}
                onChange={(milliseconds) => onChange({ ...value, milliseconds: milliseconds ?? undefined })}
            />
        </div>
    );
}

function AudioRemoveAnnotationsConfirm(props: RemoveAnnotationsConfirmProps): JSX.Element {
    const {
        open,
        stopFrame,
        onClose,
        onRemove,
    } = props;
    const [removeFrom, setRemoveFrom] = useState<TimeValue>({});
    const [removeUpTo, setRemoveUpTo] = useState<TimeValue>({});

    useEffect(() => {
        if (open) {
            setRemoveFrom({});
            setRemoveUpTo({});
        }
    }, [open]);

    return (
        <Modal
            destroyOnClose
            open={open}
            title={i18n.t('audioPlugins:audio.topBar.removeAudioAnnotations')}
            className='cvat-modal-confirm-remove-annotation cvat-modal-confirm-remove-audio-annotation'
            okButtonProps={{
                type: 'primary',
                danger: true,
            }}
            okText={i18n.t('audioPlugins:common.remove')}
            onCancel={onClose}
            onOk={() => {
                const from = timeToMilliseconds(removeFrom);
                const to = timeToMilliseconds(removeUpTo);
                onRemove(
                    typeof from === 'number' ? Math.min(from, stopFrame) : undefined,
                    typeof to === 'number' ? Math.min(to, stopFrame) : undefined,
                    false,
                );
                onClose();
            }}
        >
            <div>
                <Text>{i18n.t('audioPlugins:audio.topBar.removeWarning1')} </Text>
                <Text>{i18n.t('audioPlugins:audio.topBar.removeWarning2')} </Text>
                <Text>{i18n.t('audioPlugins:audio.topBar.removeWarning3')} </Text>
                <Text>{i18n.t('audioPlugins:audio.topBar.removeWarning4')}</Text>
                <br />
                <br />
                <br />
                <Collapse
                    bordered={false}
                    items={[{
                        key: 1,
                        label: <Text>{i18n.t('audioPlugins:audio.topBar.selectTimeRange')}</Text>,
                        children: (
                            <div className='cvat-audio-remove-annotations-time-range'>
                                <AudioTimeInput label={i18n.t('audioPlugins:audio.topBar.from')} value={removeFrom} onChange={setRemoveFrom} />
                                <AudioTimeInput label={i18n.t('audioPlugins:audio.topBar.to')} value={removeUpTo} onChange={setRemoveUpTo} />
                            </div>
                        ),
                    }]}
                />
            </div>
        </Modal>
    );
}

export default React.memo(AudioRemoveAnnotationsConfirm);
