// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { shallowEqual } from 'utils/redux';
import dayjs from 'dayjs';
import { getModelsAsync } from 'actions/models-actions';
import { updateHistoryFromQuery } from 'components/resource-sorting-filtering';
import Spin from 'antd/lib/spin';
import notification from 'antd/lib/notification';

import { CombinedState, ModelsQuery, SelectedResourceType } from 'reducers';
import { useResourceQuery } from 'utils/hooks';
import { selectionActions } from 'actions/selection-actions';
import { MLModel, ModelProviders } from 'cvat-core-wrapper';
import DeployedModelsList from './deployed-models-list';
import DeployYoloModelModal from './deploy-yolo-model-modal';
import EmptyListComponent from './empty-list';
import TopBar from './top-bar';
import {
    isLocalYoloDeployment,
    LocalYoloDeployment,
    LocalYoloDeploymentRequest,
    readLocalYoloDeployments,
    writeLocalYoloDeployments,
} from './local-yolo-deployments';

function setUpModelsList(
    models: MLModel[],
    localDeployments: LocalYoloDeployment[],
    newPage: number,
    pageSize: number,
): (MLModel | LocalYoloDeployment)[] {
    const modelIDs = new Set(models.map((model) => model.id));
    const pendingDeployments = localDeployments.filter((deployment) => !modelIDs.has(deployment.id));
    const builtInModels = models.filter((model: MLModel) => model.provider === ModelProviders.CVAT);
    const externalModels = models.filter((model: MLModel) => model.provider !== ModelProviders.CVAT);
    externalModels.sort((a, b) => dayjs(a.createdDate).valueOf() - dayjs(b.createdDate).valueOf());
    const renderModels = [...pendingDeployments, ...builtInModels, ...externalModels];
    return renderModels.slice((newPage - 1) * pageSize, newPage * pageSize);
}

function isActiveDeploymentState(state?: string): boolean {
    return ['building', 'provisioning', 'waiting'].includes((state || '').toLowerCase());
}

function isRecoverableDeployError(error: unknown): boolean {
    const code = Number((error as { code?: number }).code);
    const message = error instanceof Error ? error.message : String(error);
    return code === 504 || /gateway time-out|gateway timeout|timed out/i.test(message);
}

function ModelsPageComponent(): JSX.Element {
    const history = useHistory();
    const dispatch = useDispatch();
    const { t } = useTranslation('qualityReviewModels');
    const [deployYoloModalVisible, setDeployYoloModalVisible] = useState(false);
    const [localDeployments, setLocalDeployments] = useState<LocalYoloDeployment[]>(readLocalYoloDeployments);
    const {
        fetching,
        query,
        bulkFetching,
        interactors,
        detectors,
        trackers,
        reid,
        totalCount,
        selectedCount,
    } = useSelector((state: CombinedState) => ({
        fetching: state.models.fetching,
        query: state.models.query,
        bulkFetching: state.bulkActions.fetching,
        interactors: state.models.interactors,
        detectors: state.models.detectors,
        trackers: state.models.trackers,
        reid: state.models.reid,
        totalCount: state.models.totalCount,
        selectedCount: state.models.selected.length,
    }), shallowEqual);

    const updatedQuery = useResourceQuery<ModelsQuery>(query, { pageSize: 12 });

    const { page, pageSize } = updatedQuery;
    const allModels = [...interactors, ...detectors, ...trackers, ...reid];
    const models = setUpModelsList(allModels, localDeployments, page, pageSize);
    const activeLocalDeployments = localDeployments.some((deployment) => deployment.status !== 'failed');
    const activeNuclioDeployments = allModels.some((model) => isActiveDeploymentState(model.deploymentState));

    useEffect(() => {
        history.replace({
            search: updateHistoryFromQuery(query),
        });
    }, [query]);

    const pageOutOfBounds = totalCount && updatedQuery.page > Math.ceil(totalCount / query.pageSize);
    useEffect(() => {
        dispatch(getModelsAsync(updatedQuery));
        if (pageOutOfBounds) {
            notification.error({
                message: t('models.couldNotFetch'),
                description: t('models.invalidPage'),
            });
        }
    }, []);

    useEffect(() => {
        if (!localDeployments.length) {
            return;
        }

        const modelIDs = new Set(allModels.map((model) => model.id));
        const filteredDeployments = localDeployments.filter((deployment) => !modelIDs.has(deployment.id));
        if (filteredDeployments.length !== localDeployments.length) {
            setLocalDeployments(filteredDeployments);
            writeLocalYoloDeployments(filteredDeployments);
        }
    }, [allModels, localDeployments]);

    useEffect(() => {
        if (!activeLocalDeployments && !activeNuclioDeployments) {
            return undefined;
        }

        const timeout = window.setInterval(() => {
            dispatch(getModelsAsync(updatedQuery));
        }, 5000);

        return () => window.clearInterval(timeout);
    }, [activeLocalDeployments, activeNuclioDeployments, updatedQuery]);

    const onSelectAll = useCallback(() => {
        dispatch(selectionActions.selectResources(
            models
                .filter((m): m is MLModel => !isLocalYoloDeployment(m))
                .filter((m) => m.provider !== ModelProviders.CVAT)
                .map((m) => m.id),
            SelectedResourceType.MODELS,
        ));
    }, [models]);

    const updateLocalDeployments = useCallback((updater: (deployments: LocalYoloDeployment[]) => (
        LocalYoloDeployment[]
    )): void => {
        setLocalDeployments((prevDeployments) => {
            const nextDeployments = updater(prevDeployments);
            writeLocalYoloDeployments(nextDeployments);
            return nextDeployments;
        });
    }, []);

    const onDeploymentStarted = useCallback((
        deployment: LocalYoloDeployment,
        request: LocalYoloDeploymentRequest,
    ): void => {
        updateLocalDeployments((deployments) => [
            deployment,
            ...deployments.filter((item) => item.id !== deployment.id),
        ]);
        dispatch(getModelsAsync({ ...updatedQuery, page: 1 }));

        const deployingTimeout = window.setTimeout(() => {
            updateLocalDeployments((deployments) => deployments.map((item) => (
                item.id === deployment.id && item.status === 'uploading' ?
                    { ...item, status: 'deploying' } :
                    item
            )));
        }, 2000);

        request.then((response) => {
            updateLocalDeployments((deployments) => deployments.map((item) => (
                item.id === deployment.id ? {
                    ...item,
                    id: response.id,
                    name: response.name,
                    status: 'deploying',
                    error: undefined,
                } : item
            )));
            notification.success({
                message: '模型部署成功',
                description: `已部署 ${response.name}，函数 ID：${response.id}`,
            });
            dispatch(getModelsAsync({ ...updatedQuery, page: 1 }));
        }).catch((error: unknown) => {
            if (isRecoverableDeployError(error)) {
                updateLocalDeployments((deployments) => deployments.map((item) => (
                    item.id === deployment.id ? {
                        ...item,
                        status: 'deploying',
                        error: error instanceof Error ? error.message : String(error),
                    } : item
                )));
                notification.warning({
                    message: '部署请求仍在后台执行',
                    description: '页面请求已超时，将继续同步模型部署状态。',
                });
                dispatch(getModelsAsync({ ...updatedQuery, page: 1 }));
                return;
            }

            updateLocalDeployments((deployments) => deployments.map((item) => (
                item.id === deployment.id ? {
                    ...item,
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error),
                } : item
            )));
            notification.error({
                message: '模型部署失败',
                description: error instanceof Error ? error.message : String(error),
                duration: null,
            });
        }).finally(() => {
            window.clearTimeout(deployingTimeout);
        });
    }, [dispatch, updateLocalDeployments, updatedQuery]);

    const visibleLocalDeploymentsCount = localDeployments.filter((deployment) => (
        !allModels.some((model) => model.id === deployment.id)
    )).length;
    const effectiveTotalCount = totalCount + visibleLocalDeploymentsCount;

    const content = (effectiveTotalCount && !pageOutOfBounds) ? (
        <DeployedModelsList query={updatedQuery} models={models} totalCount={effectiveTotalCount} />
    ) : <EmptyListComponent />;

    return (
        <div className='cvat-models-page'>
            <TopBar
                disabled
                query={updatedQuery}
                selectedCount={selectedCount}
                onSelectAll={onSelectAll}
                onDeployYolo={() => setDeployYoloModalVisible(true)}
                onApplySearch={(search: string | null) => {
                    dispatch(
                        getModelsAsync({
                            ...query,
                            search,
                            page: 1,
                        }),
                    );
                }}
                onApplyFilter={(filter: string | null) => {
                    dispatch(
                        getModelsAsync({
                            ...query,
                            filter,
                            page: 1,
                        }),
                    );
                }}
                onApplySorting={(sorting: string | null) => {
                    dispatch(
                        getModelsAsync({
                            ...query,
                            sort: sorting,
                            page: 1,
                        }),
                    );
                }}
            />
            { fetching && !bulkFetching && !models.length ? (
                <div className='cvat-empty-models-list'>
                    <Spin size='large' className='cvat-spinner' />
                </div>
            ) : content }
            <DeployYoloModelModal
                open={deployYoloModalVisible}
                onClose={() => setDeployYoloModalVisible(false)}
                onDeploymentStarted={onDeploymentStarted}
            />
        </div>
    );
}

export default React.memo(ModelsPageComponent);
