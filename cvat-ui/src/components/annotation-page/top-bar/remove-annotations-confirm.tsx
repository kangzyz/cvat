// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import Modal from 'antd/lib/modal';
import Text from 'antd/lib/typography/Text';
import InputNumber from 'antd/lib/input-number';
import Checkbox from 'antd/lib/checkbox';
import Collapse from 'antd/lib/collapse';

import CVATTooltip from 'components/common/cvat-tooltip';

export interface RemoveAnnotationsConfirmProps {
    open: boolean;
    stopFrame: number;
    onClose(): void;
    onRemove(from: number | undefined, to: number | undefined, removeOnlyKeyframes: boolean): void;
}

function RemoveAnnotationsConfirm(props: RemoveAnnotationsConfirmProps): JSX.Element {
    const {
        open,
        stopFrame,
        onClose,
        onRemove,
    } = props;
    const [removeFrom, setRemoveFrom] = useState<number | undefined>();
    const [removeUpTo, setRemoveUpTo] = useState<number | undefined>();
    const [removeOnlyKeyframes, setRemoveOnlyKeyframes] = useState(false);

    useEffect(() => {
        if (open) {
            setRemoveFrom(undefined);
            setRemoveUpTo(undefined);
            setRemoveOnlyKeyframes(false);
        }
    }, [open]);

    return (
        <Modal
            destroyOnClose
            open={open}
            title='移除标注'
            className='cvat-modal-confirm-remove-annotation'
            okButtonProps={{
                type: 'primary',
                danger: true,
            }}
            okText='移除'
            onCancel={onClose}
            onOk={() => {
                onRemove(removeFrom, removeUpTo, removeOnlyKeyframes);
                onClose();
            }}
        >
            <div>
                <Text>你即将移除每一帧上的所有标注。</Text>
                <Text>如果只想移除部分帧上的标注，请在下方选择范围。</Text>
                <Text>更改仅在保存作业后生效。</Text>
                <br />
                <br />
                <br />
                <Collapse
                    bordered={false}
                    items={[{
                        key: 1,
                        label: <Text>选择范围</Text>,
                        children: (
                            <>
                                <Text>从：</Text>
                                <InputNumber
                                    min={0}
                                    max={stopFrame}
                                    onChange={(value) => {
                                        setRemoveFrom(value ?? undefined);
                                    }}
                                />
                                <Text>  到：</Text>
                                <InputNumber
                                    min={0}
                                    max={stopFrame}
                                    onChange={(value) => {
                                        setRemoveUpTo(value ?? undefined);
                                    }}
                                />
                                <CVATTooltip title='仅适用于范围内的标注'>
                                    <br />
                                    <br />
                                    <Checkbox
                                        checked={removeOnlyKeyframes}
                                        onChange={(check) => {
                                            setRemoveOnlyKeyframes(check.target.checked);
                                        }}
                                    >
                                        仅删除轨迹关键帧</Checkbox>
                                </CVATTooltip>
                            </>
                        ),
                    }]}
                />
            </div>
        </Modal>
    );
}

export default React.memo(RemoveAnnotationsConfirm);
