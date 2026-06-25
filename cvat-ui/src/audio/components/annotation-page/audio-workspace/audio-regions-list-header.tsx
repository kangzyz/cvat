// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Col, Row } from 'antd/lib/grid';
import Text from 'antd/lib/typography/Text';
import Select from 'antd/lib/select';
import {
    EyeInvisibleFilled, EyeOutlined, LockFilled, UnlockOutlined,
} from '@ant-design/icons';

import i18n from 'i18n';
import CVATTooltip from 'components/common/cvat-tooltip';

export enum AudioRegionsOrdering {
    INSERTION = 'insertion',
    START_TIME = 'startTime',
    LABEL_NAME = 'labelName',
}

interface Props {
    count: number;
    ordering: AudioRegionsOrdering;
    allLocked: boolean;
    allHidden: boolean;
    switchLockAllShortcut: string;
    switchHiddenAllShortcut: string;
    onChangeOrdering(value: AudioRegionsOrdering): void;
    onLockAll(): void;
    onUnlockAll(): void;
    onHideAll(): void;
    onShowAll(): void;
}

function AudioRegionsListHeader(props: Props): JSX.Element {
    const {
        count,
        ordering,
        allLocked,
        allHidden,
        switchLockAllShortcut,
        switchHiddenAllShortcut,
        onChangeOrdering,
        onLockAll,
        onUnlockAll,
        onHideAll,
        onShowAll,
    } = props;

    return (
        <div className='cvat-audio-regions-list-header'>
            <Row justify='space-between' align='middle'>
                <Col>
                    <Text>{i18n.t('audioPlugins:common.items', { count })}</Text>
                </Col>
                <Col className='cvat-audio-regions-list-header-actions'>
                    <CVATTooltip title={i18n.t('audioPlugins:audio.list.switchLockAll', { shortcut: switchLockAllShortcut })}>
                        {allLocked ? (
                            <LockFilled onClick={onUnlockAll} />
                        ) : (
                            <UnlockOutlined onClick={onLockAll} />
                        )}
                    </CVATTooltip>
                    <CVATTooltip title={i18n.t('audioPlugins:audio.list.switchHiddenAll', { shortcut: switchHiddenAllShortcut })}>
                        {allHidden ? (
                            <EyeInvisibleFilled onClick={onShowAll} />
                        ) : (
                            <EyeOutlined onClick={onHideAll} />
                        )}
                    </CVATTooltip>
                </Col>
            </Row>
            <Row className='cvat-audio-regions-list-ordering' align='middle'>
                <Text>{i18n.t('audioPlugins:audio.list.sortBy')}</Text>
                <Select
                    size='small'
                    className='cvat-audio-regions-list-ordering-selector'
                    value={ordering}
                    onChange={onChangeOrdering}
                >
                    {Object.values(AudioRegionsOrdering).map((value) => (
                        <Select.Option key={value} value={value}>
                            {i18n.t(`audioPlugins:audio.list.ordering.${value}`)}
                        </Select.Option>
                    ))}
                </Select>
            </Row>
        </div>
    );
}

export default React.memo(AudioRegionsListHeader);
