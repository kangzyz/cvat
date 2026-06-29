// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Row, Col } from 'antd/lib/grid';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    LoadingOutlined,
    MoreOutlined,
} from '@ant-design/icons';
import Modal from 'antd/lib/modal';
import Title from 'antd/lib/typography/Title';
import Meta from 'antd/lib/card/Meta';
import Divider from 'antd/lib/divider';
import Card from 'antd/lib/card';
import Button from 'antd/lib/button';
import { MenuProps } from 'antd/lib/menu';

import Preview from 'components/common/preview';
import { useCardHeightHOC, useContextMenuClick, usePlugins } from 'utils/hooks';
import { CombinedState } from 'reducers';
import { MLModel, ModelProviders } from 'cvat-core-wrapper';
import ModelActionsComponent from './actions-menu';

interface Props {
    model: MLModel;
    selected: boolean;
    onClick: (event: React.MouseEvent) => boolean;
}

const useCardHeight = useCardHeightHOC({
    containerClassName: 'cvat-models-page',
    siblingClassNames: ['cvat-models-pagination', 'cvat-models-page-top-bar'],
    paddings: 72,
    minHeight: 200,
    numberOfRows: 3,
});

function deploymentStateTag(state?: string): JSX.Element | null {
    const normalized = (state || '').toLowerCase();
    if (!normalized) {
        return null;
    }

    if (normalized === 'ready') {
        return <Tag color='success' icon={<CheckCircleOutlined />}>已就绪</Tag>;
    }

    if (['building', 'provisioning', 'waiting'].includes(normalized)) {
        return <Tag color='processing' icon={<LoadingOutlined />}>部署中</Tag>;
    }

    if (['error', 'unhealthy'].includes(normalized)) {
        return <Tag color='error' icon={<CloseCircleOutlined />}>部署失败</Tag>;
    }

    return <Tag>{state}</Tag>;
}

function DeployedModelItem(props: Readonly<Props>): JSX.Element {
    const { model, selected, onClick } = props;
    const { t } = useTranslation('qualityReviewModels');
    const [isModalShown, setIsModalShown] = useState(false);
    const height = useCardHeight();
    const { itemRef, handleContextMenuClick, handleContextMenuCapture } = useContextMenuClick<HTMLDivElement>();
    const style: React.CSSProperties = { height };

    const systemModel = model.provider === ModelProviders.CVAT;
    const onOpenModel = (event: React.MouseEvent): void => {
        const cancel = !systemModel ? onClick(event) : false;
        if (!cancel) {
            setIsModalShown(true);
        }
    };
    const onCloseModel = (): void => {
        setIsModalShown(false);
    };

    const created = dayjs(model.createdDate).fromNow();
    const modelDescription = !systemModel ?
        <Text type='secondary'>{t('models.added', { time: created })}</Text> :
        <Text type='secondary'>{t('models.systemModel')}</Text>;
    const stateTag = deploymentStateTag(model.deploymentState);

    const topBarItems: [JSX.Element, number][] = [];

    const topBarPlugins = usePlugins(
        (state: CombinedState) => state.plugins.components.modelsPage.modelItem.topBar.menu.items, props,
    );

    topBarItems.push(
        ...topBarPlugins.map(({ component: Component, weight }, index) => (
            [<Component key={index} targetProps={props} />, weight] as [JSX.Element, number]
        )),
    );
    const modelTopBar = (
        <div className='cvat-model-item-top-bar'>
            {topBarItems.sort((item1, item2) => item1[1] - item2[1])
                .map((item) => item[0])}
        </div>
    );

    const cardClassName = `cvat-models-item-card${selected ? ' cvat-item-selected' : ''}`;

    const card = (menuItems: NonNullable<MenuProps['items']>): JSX.Element => (
        <Card
            ref={itemRef}
            cover={(
                <Preview
                    model={model}
                    loadingClassName='cvat-model-item-loading-preview'
                    emptyPreviewClassName='cvat-model-item-empty-preview'
                    previewWrapperClassName='cvat-models-item-card-preview-wrapper'
                    previewClassName='cvat-models-item-card-preview'
                    onClick={onOpenModel}
                />
            )}
            style={style}
            size='small'
            className={cardClassName}
            hoverable
            onContextMenuCapture={handleContextMenuCapture}
        >
            <Meta
                title={(
                    <Text ellipsis={{ tooltip: model.name }} onClick={onOpenModel} className='cvat-models-item-title' aria-hidden>
                        {model.provider !== ModelProviders.CVAT && `#${model.id}: `}
                        {model.name}
                    </Text>
                )}
                description={(
                    <div className='cvat-models-item-description'>
                        <Row onClick={onOpenModel} className='cvat-models-item-text-description'>
                            {model.owner && (
                                <>
                                    <Text type='secondary'>{t('models.createdBy', { owner: model.owner })}</Text>
                                    <br />
                                </>
                            )}
                            {modelDescription}
                            {stateTag ? (
                                <>
                                    <br />
                                    {stateTag}
                                </>
                            ) : null}
                        </Row>
                        {
                            (menuItems.length > 0) ? (
                                <Button
                                    className='cvat-deployed-model-details-button cvat-actions-menu-button'
                                    type='link'
                                    size='large'
                                    icon={<MoreOutlined />}
                                    onClick={handleContextMenuClick}
                                />
                            ) : null
                        }
                    </div>
                )}
            />
            { modelTopBar }
        </Card>
    );

    return (
        <>
            <Modal
                className='cvat-model-info-modal'
                title={t('models.modalTitle')}
                open={isModalShown}
                onCancel={onCloseModel}
                footer={null}
            >
                <Preview
                    model={model}
                    loadingClassName='cvat-model-item-loading-preview'
                    emptyPreviewClassName='cvat-model-item-empty-preview'
                    previewWrapperClassName='cvat-models-item-card-preview-wrapper'
                    previewClassName='cvat-models-item-card-preview'
                />
                { modelTopBar }
                <div className='cvat-model-info-container'>
                    <Title level={3}>
                        {model.provider !== ModelProviders.CVAT && `#${model.id}: `}
                        {model.name}
                    </Title>
                    {modelDescription}
                </div>
                <Divider />
                {
                    model.labels?.length ? (
                        <>
                            <div className='cvat-model-info-container'>
                                <Text className='cvat-model-info-modal-labels-title'>{t('models.labels')}</Text>
                            </div>
                            <div className='cvat-model-info-container cvat-model-info-modal-labels-list'>
                                {model.labels.map((label) => <Tag key={label.name}>{label.name}</Tag>)}
                            </div>
                            <Divider />
                        </>
                    ) : null
                }
                <Row justify='space-between' className='cvat-model-info-container'>
                    <Col span={15}>
                        <Row>
                            <Col span={8}>
                                <Text strong>{t('models.provider')}</Text>
                            </Col>
                            <Col>
                                <Text strong>{t('models.type')}</Text>
                            </Col>
                        </Row>
                        <Row>
                            <Col span={8}>
                                {model.provider}
                            </Col>
                            <Col>
                                {model.displayKind}
                            </Col>
                        </Row>
                    </Col>
                    {model.owner && (
                        <Col>
                            <Row>
                                <Col>
                                    <Text strong>{t('models.owner')}</Text>
                                </Col>
                            </Row>
                            <Row>
                                <Col>
                                    {model.owner}
                                </Col>
                            </Row>
                        </Col>
                    )}
                </Row>
            </Modal>
            <ModelActionsComponent
                model={model}
                dropdownTrigger={['contextMenu']}
                triggerElement={card}
            />
        </>
    );
}

export default React.memo(DeployedModelItem);
