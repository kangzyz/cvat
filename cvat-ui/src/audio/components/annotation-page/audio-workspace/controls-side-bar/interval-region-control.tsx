// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Icon from '@ant-design/icons';
import Popover from 'antd/lib/popover';
import Button from 'antd/lib/button';
import Text from 'antd/lib/typography/Text';
import { Row, Col } from 'antd/lib/grid';
import { useSelector } from 'react-redux';

import { IntervalToolsIcon } from 'icons';
import { ActiveControl, CombinedState } from 'reducers';
import { Label } from 'cvat-core-wrapper';
import i18n from 'i18n';
import CVATTooltip from 'components/common/cvat-tooltip';
import LabelSelector from 'components/label-selector/label-selector';
import GlobalHotKeys from 'utils/mousetrap-react';
import { ShortcutScope } from 'utils/enums';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import { subKeyMap } from 'utils/component-subkeymap';

export interface Props {
    activeControl: ActiveControl;
    createRegionShortkey: string;
    recordRegionShortkey: string;
    extendRegionShortkey: string;
    labels: Label[];
    activeLabelId: number | null;
    updateActiveControl(activeControl: ActiveControl): void;
    onSetActiveLabel(labelId: number | null): void;
    onExtendRegion(labelId: number): void;
}

const componentShortcuts = {
    CREATE_AUDIO_REGION: {
        name: i18n.t('audioPlugins:audio.controls.createIntervalName'),
        description: i18n.t('audioPlugins:audio.controls.createIntervalDescription'),
        sequences: ['n'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    RECORD_AUDIO_REGION: {
        name: i18n.t('audioPlugins:audio.controls.recordIntervalName'),
        description: i18n.t('audioPlugins:audio.controls.recordIntervalDescription'),
        sequences: ['shift+n'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
    EXTEND_AUDIO_REGION_FROM_LAST: {
        name: i18n.t('audioPlugins:audio.controls.extendIntervalName'),
        description: i18n.t('audioPlugins:audio.controls.extendIntervalDescription'),
        sequences: ['shift+e'],
        scope: ShortcutScope.AUDIO_WORKSPACE_CONTROLS,
    },
};

registerComponentShortcuts(componentShortcuts);

function IntervalRegionControl(props: Props): JSX.Element {
    const {
        activeControl,
        createRegionShortkey,
        recordRegionShortkey,
        extendRegionShortkey,
        labels,
        activeLabelId,
        updateActiveControl,
        onSetActiveLabel,
        onExtendRegion,
    } = props;

    const { keyMap } = useSelector((state: CombinedState) => state.shortcuts);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [selectedLabelId, setSelectedLabelId] = useState<number | null>(
        activeLabelId ?? (labels.length ? labels[0].id ?? null : null),
    );

    const noLabels = labels.length === 0;
    const drawing = activeControl === ActiveControl.AUDIO_REGION_CREATE;
    const recording = activeControl === ActiveControl.AUDIO_REGION_RECORD;
    const isActive = drawing || recording;

    useEffect(() => {
        if (selectedLabelId === null && labels.length) {
            setSelectedLabelId(activeLabelId ?? labels[0].id ?? null);
        }
    }, [activeLabelId, labels, selectedLabelId]);

    const getLabelId = (): number | null => selectedLabelId ?? activeLabelId ?? labels[0]?.id ?? null;
    const activateLabel = (labelId: number): void => {
        onSetActiveLabel(labelId);
        setSelectedLabelId(labelId);
    };

    const drawInterval = (): void => {
        if (noLabels) return;

        const labelId = getLabelId();
        if (labelId === null) return;

        activateLabel(labelId);
        updateActiveControl(ActiveControl.AUDIO_REGION_CREATE);
        setPopoverOpen(false);
    };

    const recordInterval = (): void => {
        if (noLabels) return;

        const labelId = getLabelId();
        if (labelId === null) return;

        activateLabel(labelId);
        updateActiveControl(ActiveControl.AUDIO_REGION_RECORD);
        setPopoverOpen(false);
    };

    const extendInterval = (): void => {
        if (noLabels || recording) return;

        const labelId = getLabelId();
        if (labelId === null) return;

        activateLabel(labelId);
        onExtendRegion(labelId);
        setPopoverOpen(false);
    };

    const stopActiveIntervalControl = (): void => {
        if (isActive) {
            updateActiveControl(ActiveControl.CURSOR);
            setPopoverOpen(false);
        }
    };

    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        CREATE_AUDIO_REGION: (event?: KeyboardEvent) => {
            if (event) event.preventDefault();
            if (drawing) {
                stopActiveIntervalControl();
            } else {
                drawInterval();
            }
        },
        RECORD_AUDIO_REGION: (event?: KeyboardEvent) => {
            if (event) event.preventDefault();
            if (recording) {
                stopActiveIntervalControl();
            } else {
                recordInterval();
            }
        },
        EXTEND_AUDIO_REGION_FROM_LAST: (event?: KeyboardEvent) => {
            if (event) event.preventDefault();
            extendInterval();
        },
    };

    const renderAction = (
        label: string,
        description: string,
        shortcut: string,
        onClick: () => void,
        disabled = false,
    ): JSX.Element => (
        <CVATTooltip title={`${description} ${shortcut}`} placement='bottom'>
            <Button
                block
                type='primary'
                disabled={disabled}
                onClick={onClick}
            >
                {label}
            </Button>
        </CVATTooltip>
    );

    const popoverContent = (
        <div className='cvat-audio-interval-region-popover-content'>
            <Row justify='start'>
                <Col>
                    <Text className='cvat-text-color' strong>{i18n.t('audioPlugins:audio.controls.audioInterval')}</Text>
                </Col>
            </Row>
            <Row justify='start' className='cvat-audio-interval-popover-label-row'>
                <Col>
                    <Text className='cvat-text-color'>{i18n.t('audioPlugins:common.label')}</Text>
                </Col>
            </Row>
            <Row justify='center'>
                <Col span={24}>
                    <LabelSelector
                        style={{ width: '100%' }}
                        labels={labels}
                        value={selectedLabelId}
                        onChange={(label: Label) => setSelectedLabelId(label.id ?? null)}
                    />
                </Col>
            </Row>
            <Row gutter={8} style={{ marginTop: 8 }}>
                <Col span={8}>
                    {renderAction(
                        i18n.t('audioPlugins:audio.controls.draw'),
                        i18n.t('audioPlugins:audio.controls.drawDescription'),
                        createRegionShortkey,
                        drawInterval,
                        selectedLabelId === null,
                    )}
                </Col>
                <Col span={8}>
                    {renderAction(
                        i18n.t('audioPlugins:audio.controls.record'),
                        i18n.t('audioPlugins:audio.controls.recordDescription'),
                        recordRegionShortkey,
                        recordInterval,
                        selectedLabelId === null,
                    )}
                </Col>
                <Col span={8}>
                    {renderAction(
                        i18n.t('audioPlugins:audio.controls.extend'),
                        i18n.t('audioPlugins:audio.controls.extendDescription'),
                        extendRegionShortkey,
                        extendInterval,
                        selectedLabelId === null || recording,
                    )}
                </Col>
            </Row>
        </div>
    );

    return (
        <>
            <GlobalHotKeys
                keyMap={subKeyMap(componentShortcuts, keyMap)}
                handlers={handlers}
            />
            <Popover
                overlayClassName='cvat-audio-interval-region-popover'
                trigger='click'
                placement='right'
                open={popoverOpen && !noLabels}
                onOpenChange={(visible) => setPopoverOpen(visible && !noLabels)}
                content={popoverContent}
            >
                <CVATTooltip
                    title={
                        noLabels ?
                            i18n.t('audioPlugins:audio.controls.addLabelToCreate') :
                            i18n.t('audioPlugins:audio.controls.intervalTools')
                    }
                    placement='right'
                >
                    <Icon
                        component={IntervalToolsIcon}
                        className={
                            (isActive ?
                                'cvat-active-canvas-control cvat-audio-interval-region-control' :
                                'cvat-audio-interval-region-control') +
                            (noLabels ? ' cvat-audio-interval-region-control-disabled' : '')
                        }
                        onClick={() => {
                            if (noLabels) return;
                            if (isActive) {
                                stopActiveIntervalControl();
                            } else {
                                setPopoverOpen(!popoverOpen);
                            }
                        }}
                    />
                </CVATTooltip>
            </Popover>
        </>
    );
}

export default React.memo(IntervalRegionControl);
