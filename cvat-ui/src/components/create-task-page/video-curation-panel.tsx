// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { useHistory } from 'react-router';
import Button from 'antd/lib/button';
import Space from 'antd/lib/space';
import Text from 'antd/lib/typography/Text';
import { ScissorOutlined } from '@ant-design/icons';

interface Props {
    onPrepared?: (sharePath: string, stats: unknown) => void;
}

export default function VideoCurationPanel(_props: Props): JSX.Element {
    const history = useHistory();

    return (
        <div className='cvat-video-curation-wrapper cvat-video-curation-entry'>
            <Space>
                <ScissorOutlined />
                <Text className='cvat-text-color'>视频抽帧筛选</Text>
                <Button
                    size='small'
                    type='primary'
                    onClick={() => history.push('/frame-extraction')}
                >
                    打开
                </Button>
            </Space>
        </div>
    );
}
