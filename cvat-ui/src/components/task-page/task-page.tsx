// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { shallowEqual } from 'utils/redux';
import { Row, Col } from 'antd/lib/grid';
import Spin from 'antd/lib/spin';
import notification from 'antd/lib/notification';

import { getInferenceStatusAsync } from 'actions/models-actions';
import { updateJobAsync, jobsActions } from 'actions/jobs-actions';
import {
    getCore, Task, Job, MediaType,
} from 'cvat-core-wrapper';
import { TaskNotFoundComponent } from 'components/common/not-found';
import JobListComponent from 'components/task-page/job-list';
import ModelRunnerModal from 'components/model-runner-modal/model-runner-dialog';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import MoveTaskModal from 'components/move-task-modal/move-task-modal';
import { CombinedState } from 'reducers';
import { updateTaskAsync } from 'actions/tasks-actions';
import TopBarComponent from './top-bar';
import DetailsComponent from './details';

const core = getCore();

function TaskPageComponent(): JSX.Element {
    const history = useHistory();
    const { t } = useTranslation('resources');
    const id = +useParams<{ id: string }>().id;
    const dispatch = useDispatch();
    const [taskInstance, setTaskInstance] = useState<Task | null>(null);
    const [fetchingTask, setFetchingTask] = useState(true);

    const {
        deletes,
        updates,
        jobsFetching,
        bulkFetching,
    } = useSelector((state: CombinedState) => ({
        deletes: state.tasks.activities.deletes,
        updates: state.tasks.activities.updates,
        jobsFetching: state.jobs.fetching,
        bulkFetching: state.bulkActions.fetching,
    }), shallowEqual);
    const isTaskUpdating = (updates[id] || jobsFetching) && !bulkFetching;

    const receiveTask = async (): Promise<void> => {
        try {
            const [task]: Task[] = await core.tasks.get({ id });

            if (task) {
                setTaskInstance(task);
                dispatch(jobsActions.getJobsSuccess(
                    Object.assign([...task.jobs], { count: task.jobs.length })),
                );
            }
        } catch (error: any) {
            notification.error({
                message: t('details.couldNotReceiveTask'),
                description: error.toString(),
            });
        }
    };

    useEffect(() => {
        receiveTask().finally(() => {
            setFetchingTask(false);
        });
        dispatch(getInferenceStatusAsync());
    }, []);

    useEffect(() => {
        if (taskInstance && id in deletes && deletes[id]) {
            history.push('/tasks');
        }
    }, [deletes]);

    const isAudioTask = taskInstance && taskInstance.mediaType === MediaType.AUDIO;
    const labelsEditorProps = useMemo(() => (isAudioTask ? {
        enableSkeletonCreator: false,
        enableFromModelCreator: false,
        showLabelType: false,
    } : undefined), [isAudioTask]);

    if (fetchingTask) {
        return <Spin size='large' className='cvat-spinner' />;
    }

    if (!taskInstance) {
        return <TaskNotFoundComponent />;
    }

    const onUpdateTask = (task: Task, fields: Parameters<Task['save']>[0] = {}): Promise<Task> => {
        const promise = dispatch(updateTaskAsync(task, fields));
        promise.then((updatedTask: Task) => {
            setTaskInstance(updatedTask);
        });
        return promise;
    };

    const onJobUpdate = (job: Job, data: Parameters<Job['save']>[0]): void => {
        dispatch(updateJobAsync(job, data));
    };

    return (
        <div className='cvat-task-page'>
            { isTaskUpdating ? <CVATLoadingSpinner size='large' /> : null }
            <Row
                justify='center'
                align='top'
                className='cvat-task-details-wrapper'
            >
                <Col span={22} xl={18} xxl={14}>
                    <TopBarComponent taskInstance={taskInstance} onUpdateTask={onUpdateTask} />
                    <DetailsComponent
                        task={taskInstance}
                        onUpdateTask={onUpdateTask}
                        labelsEditorProps={labelsEditorProps}
                    />
                    <JobListComponent task={taskInstance} onJobUpdate={onJobUpdate} />
                </Col>
            </Row>
            <ModelRunnerModal />
            <MoveTaskModal onUpdateTask={onUpdateTask} />
        </div>
    );
}

export default React.memo(TaskPageComponent);
