// Copyright (C) 2020-2025 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import Dropdown from 'antd/lib/dropdown';
import Modal from 'antd/lib/modal';
import notification from 'antd/lib/notification';
import { DeleteOutlined } from '@ant-design/icons';
import { getCore, MLModel } from 'cvat-core-wrapper';
import { usePlugins } from 'utils/hooks';
import { CombinedState } from 'reducers';
import { MenuProps } from 'antd/lib/menu';
import { useDispatch, useSelector } from 'react-redux';
import { shallowEqual } from 'utils/redux';
import { getModelsAsync } from 'actions/models-actions';

const core = getCore();

interface ModelActionsProps {
    model: MLModel;
    triggerElement: (menuItems: NonNullable<MenuProps['items']>) => JSX.Element | null;
    dropdownTrigger?: ('click' | 'hover' | 'contextMenu')[];
}

function ModelActionsComponent(props: Readonly<ModelActionsProps>): JSX.Element | null {
    const {
        model,
        triggerElement,
        dropdownTrigger,
    } = props;
    const {
        interactors,
        detectors,
        trackers,
        reid,
        selectedIds,
        query,
    } = useSelector((state: CombinedState) => ({
        interactors: state.models.interactors,
        detectors: state.models.detectors,
        trackers: state.models.trackers,
        reid: state.models.reid,
        selectedIds: state.models.selected,
        query: state.models.query,
    }), shallowEqual);
    const dispatch = useDispatch();

    const allModels = [
        ...interactors,
        ...detectors,
        ...trackers,
        ...reid,
    ];

    const menuPlugins = usePlugins(
        (state: CombinedState) => state.plugins.components.modelsPage.modelItem.menu.items,
        { model },
        { allModels, selectedIds },
    );
    const menuItems: [NonNullable<MenuProps['items']>[0], number][] = [];
    if (model.isDeletable) {
        menuItems.push([{
            key: 'delete-model',
            icon: <DeleteOutlined />,
            label: '删除模型',
            danger: true,
            onClick: ({ domEvent }) => {
                domEvent.stopPropagation();
                Modal.confirm({
                    title: '删除模型',
                    content: `确定删除模型“${model.name}”吗？该操作会删除对应 Nuclio 函数和本地模型部署目录。`,
                    okText: '删除',
                    okButtonProps: { danger: true },
                    cancelText: '取消',
                    onOk: async () => {
                        try {
                            await core.lambda.deleteModel(model);
                            notification.success({
                                message: '模型已删除',
                                description: model.name,
                            });
                            dispatch(getModelsAsync(query));
                        } catch (error: unknown) {
                            notification.error({
                                message: '模型删除失败',
                                description: error instanceof Error ? error.message : String(error),
                                duration: null,
                            });
                        }
                    },
                });
            },
        }, 0]);
    }
    menuItems.push(...menuPlugins
        .map(({ component, weight }): typeof menuItems[0] => [(
            component as (pluginProps?: any) => NonNullable<MenuProps['items']>[0]
        )({
            targetProps: props, targetState: { allModels, selectedIds },
        }), weight]),
    );

    // Sort menu items by weight before passing to Dropdown
    const sortedMenuItems = [...menuItems].sort((menuItem1, menuItem2) => menuItem1[1] - menuItem2[1]);
    const finalMenuItems = sortedMenuItems.map((menuItem) => menuItem[0]);

    const renderedTrigger = triggerElement(finalMenuItems);
    if (!renderedTrigger) {
        return null;
    }

    return (
        <Dropdown
            trigger={dropdownTrigger || ['click']}
            destroyPopupOnHide
            menu={{
                items: finalMenuItems,
                triggerSubMenuAction: 'click',
            }}
        >
            {renderedTrigger}
        </Dropdown>
    );
}

export default React.memo(ModelActionsComponent);
