// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import dayjs from 'dayjs';
import { LoadingOutlined, CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import Card from 'antd/lib/card';
import Meta from 'antd/lib/card/Meta';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import Tooltip from 'antd/lib/tooltip';

import { useCardHeightHOC } from 'utils/hooks';
import { LocalYoloDeployment } from './local-yolo-deployments';

interface Props {
    deployment: LocalYoloDeployment;
}

const useCardHeight = useCardHeightHOC({
    containerClassName: 'cvat-models-page',
    siblingClassNames: ['cvat-models-pagination', 'cvat-models-page-top-bar'],
    paddings: 72,
    minHeight: 200,
    numberOfRows: 3,
});

function statusTag(deployment: LocalYoloDeployment): JSX.Element {
    if (deployment.status === 'failed') {
        return (
            <Tooltip title={deployment.error || undefined}>
                <Tag color='error' icon={<CloseCircleOutlined />}>部署失败</Tag>
            </Tooltip>
        );
    }

    if (deployment.status === 'uploading') {
        return <Tag color='processing' icon={<UploadOutlined />}>上传中</Tag>;
    }

    return <Tag color='processing' icon={<LoadingOutlined />}>部署中</Tag>;
}

function PendingYoloModelItem(props: Readonly<Props>): JSX.Element {
    const { deployment } = props;
    const height = useCardHeight();
    const labelsPreview = deployment.labels.slice(0, 4).join(', ');

    return (
        <Card
            style={{ height }}
            size='small'
            className='cvat-models-item-card cvat-models-item-card-pending'
            cover={(
                <div className='cvat-models-item-pending-preview'>
                    {deployment.status === 'failed' ? <CloseCircleOutlined /> : <LoadingOutlined spin />}
                </div>
            )}
        >
            <Meta
                title={(
                    <Text ellipsis={{ tooltip: deployment.name }} className='cvat-models-item-title'>
                        {deployment.name}
                    </Text>
                )}
                description={(
                    <div className='cvat-models-item-description cvat-models-item-pending-description'>
                        <div className='cvat-models-item-text-description'>
                            <Text type='secondary'>{deployment.id}</Text>
                            <br />
                            <Text type='secondary'>{dayjs(deployment.createdAt).fromNow()}</Text>
                            {labelsPreview ? (
                                <>
                                    <br />
                                    <Text type='secondary' ellipsis={{ tooltip: labelsPreview }}>
                                        {labelsPreview}
                                    </Text>
                                </>
                            ) : null}
                        </div>
                        {statusTag(deployment)}
                    </div>
                )}
            />
        </Card>
    );
}

export default React.memo(PendingYoloModelItem);
