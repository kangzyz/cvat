// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Row, Col } from 'antd/lib/grid';
import Form from 'antd/lib/form';
import Text from 'antd/lib/typography/Text';
import Button from 'antd/lib/button';
import Checkbox, { CheckboxChangeEvent } from 'antd/lib/checkbox';
import CheckboxGroup from 'antd/lib/checkbox/Group';
import Input from 'antd/lib/input';
import Radio from 'antd/lib/radio';
import Select from 'antd/lib/select';
import notification from 'antd/lib/notification';

import { WebhookContentType, WebhookSourceType } from 'cvat-core/src/enums';
import { getCore, Webhook } from 'cvat-core-wrapper';
import ProjectSearchField from 'components/create-task-page/project-search-field';
import { useSelector, useDispatch } from 'react-redux';
import { CombinedState } from 'reducers';
import { createWebhookAsync, updateWebhookAsync } from 'actions/webhooks-actions';

export enum EventsMethod {
    SEND_EVERYTHING = 'SEND_EVERYTHING',
    SELECT_INDIVIDUAL = 'SELECT_INDIVIDUAL',
}

interface SetupWebhookFormValues {
    description?: string;
    targetURL: string;
    contentType: WebhookContentType;
    secret?: string;
    enableSSL: boolean;
    isActive: boolean;
    eventsMethod: EventsMethod;
    events: string[];
}

interface WebhookEventOption {
    value: string;
    action: string;
    resource: string;
    order: number;
}

interface WebhookEventGroup {
    resource: string;
    events: WebhookEventOption[];
}

interface Props {
    webhook?: Webhook | null;
    defaultProjectId: number | null;
}

const EVENT_ACTION_ORDER = new Map([
    ['create', 0],
    ['update', 1],
    ['delete', 2],
]);

function parseEvent(value: string, order: number): WebhookEventOption {
    const separatorIndex = value.indexOf(':');

    if (separatorIndex === -1) {
        return {
            value,
            action: value,
            resource: value,
            order,
        };
    }

    return {
        value,
        action: value.slice(0, separatorIndex),
        resource: value.slice(separatorIndex + 1),
        order,
    };
}

function groupDetailedEvents(events: string[]): WebhookEventGroup[] {
    const groupedEvents = new Map<string, WebhookEventOption[]>();

    events.forEach((value, order) => {
        const event = parseEvent(value, order);
        const resourceEvents = groupedEvents.get(event.resource) || [];
        resourceEvents.push(event);
        groupedEvents.set(event.resource, resourceEvents);
    });

    return Array.from(groupedEvents, ([resource, resourceEvents]) => ({
        resource,
        events: resourceEvents.sort((left, right) => {
            const leftOrder = EVENT_ACTION_ORDER.get(left.action);
            const rightOrder = EVENT_ACTION_ORDER.get(right.action);

            if (typeof leftOrder === 'number' && typeof rightOrder === 'number') {
                return leftOrder - rightOrder;
            }
            if (typeof leftOrder === 'number') return -1;
            if (typeof rightOrder === 'number') return 1;
            return left.order - right.order;
        }),
    }));
}

export function groupEvents(events: string[]): string[] {
    return groupDetailedEvents(events).map(({ resource }) => resource);
}

function collectEvents(method: EventsMethod, selectedEvents: string[], allEvents: string[]): string[] {
    if (method === EventsMethod.SEND_EVERYTHING) {
        return [...allEvents];
    }

    const selectedEventSet = new Set(selectedEvents);
    return allEvents.filter((event) => selectedEventSet.has(event));
}

function areSameEvents(leftEvents: string[], rightEvents: string[]): boolean {
    const leftEventSet = new Set(leftEvents);
    const rightEventSet = new Set(rightEvents);

    return leftEventSet.size === rightEventSet.size &&
        Array.from(leftEventSet).every((event) => rightEventSet.has(event));
}

function SetupWebhookContent(props: Props): JSX.Element {
    const dispatch = useDispatch();
    const { t } = useTranslation('common');
    const { webhook, defaultProjectId } = props;
    const [form] = Form.useForm<SetupWebhookFormValues>();
    const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
    const [projectId, setProjectId] = useState<number | null>(defaultProjectId);

    const organization = useSelector((state: CombinedState) => state.organizations.current);
    const eventsMethod = Form.useWatch('eventsMethod', form);
    const watchedEvents = Form.useWatch('events', form);
    const selectedEvents = watchedEvents || [];
    const selectedEventSet = useMemo(() => new Set(selectedEvents), [selectedEvents]);
    const eventGroups = useMemo(() => groupDetailedEvents(webhookEvents), [webhookEvents]);

    useEffect(() => {
        let isCurrentRequest = true;
        const core = getCore();
        const sourceType = webhook?.type || (projectId ?
            WebhookSourceType.PROJECT : WebhookSourceType.ORGANIZATION);

        core.classes.Webhook.availableEvents(sourceType).then((events: string[]) => {
            if (isCurrentRequest) {
                setWebhookEvents(events);
            }
        });

        return () => {
            isCurrentRequest = false;
        };
    }, [projectId, webhook]);

    useEffect(() => {
        if (!webhook || !webhookEvents.length) return;

        const eventsMethodValue = areSameEvents(webhookEvents, webhook.events) ?
            EventsMethod.SEND_EVERYTHING : EventsMethod.SELECT_INDIVIDUAL;

        form.setFieldsValue({
            description: webhook.description || '',
            targetURL: webhook.targetURL,
            contentType: webhook.contentType,
            secret: webhook.secret || '',
            enableSSL: webhook.enableSSL,
            isActive: webhook.isActive,
            events: collectEvents(EventsMethod.SELECT_INDIVIDUAL, webhook.events, webhookEvents),
            eventsMethod: eventsMethodValue,
        });
    }, [form, webhook, webhookEvents]);

    useEffect(() => {
        if (webhook || !webhookEvents.length) return;

        const currentEvents = form.getFieldValue('events') || [];
        const availableSelectedEvents = collectEvents(
            EventsMethod.SELECT_INDIVIDUAL,
            currentEvents,
            webhookEvents,
        );

        if (!areSameEvents(currentEvents, availableSelectedEvents)) {
            form.setFieldValue('events', availableSelectedEvents);
        }
    }, [form, webhook, webhookEvents]);

    const handleSubmit = useCallback(async (values: SetupWebhookFormValues): Promise<void> => {
        try {
            let notificationConfig = {
                message: t('webhooks.setup.updatedSuccess'),
                className: 'cvat-notification-update-webhook-success',
            };
            const events = collectEvents(values.eventsMethod, values.events || [], webhookEvents);

            if (webhook) {
                webhook.description = values.description || '';
                webhook.targetURL = values.targetURL;
                webhook.secret = values.secret || '';
                webhook.contentType = values.contentType;
                webhook.isActive = values.isActive;
                webhook.enableSSL = values.enableSSL;
                webhook.events = events;

                await dispatch(updateWebhookAsync(webhook));
            } else {
                const rawWebhookData = {
                    description: values.description,
                    target_url: values.targetURL,
                    content_type: values.contentType,
                    secret: values.secret,
                    enable_ssl: values.enableSSL,
                    is_active: values.isActive,
                    events,
                    organization_id: projectId ? undefined : organization?.id,
                    project_id: projectId || undefined,
                    type: projectId ? WebhookSourceType.PROJECT : WebhookSourceType.ORGANIZATION,
                };
                notificationConfig = {
                    message: t('webhooks.setup.createdSuccess'),
                    className: 'cvat-notification-create-webhook-success',
                };
                await dispatch(createWebhookAsync(rawWebhookData));
                form.resetFields();
            }

            notification.info(notificationConfig);
        } catch (_error) {
            // Errors are reported by the Webhook Redux actions.
        }
    }, [dispatch, form, organization?.id, projectId, t, webhook, webhookEvents]);

    const toggleEventGroup = useCallback((group: WebhookEventGroup, checked: boolean): void => {
        const nextEventSet = new Set(form.getFieldValue('events') || []);

        group.events.forEach(({ value }) => {
            if (checked) {
                nextEventSet.add(value);
            } else {
                nextEventSet.delete(value);
            }
        });

        form.setFieldValue('events', webhookEvents.filter((event) => nextEventSet.has(event)));
        form.validateFields(['events']).catch(() => undefined);
    }, [form, webhookEvents]);

    return (
        <Row justify='start' align='middle' className='cvat-setup-webhook-content'>
            <Col span={24}>
                <Text className='cvat-title'>{t('webhooks.setup.title')}</Text>
            </Col>
            <Col span={24}>
                <Form
                    form={form}
                    layout='vertical'
                    onFinish={handleSubmit}
                    initialValues={{
                        contentType: WebhookContentType.JSON,
                        eventsMethod: EventsMethod.SEND_EVERYTHING,
                        events: [],
                        enableSSL: true,
                        isActive: true,
                    }}
                >
                    <Form.Item
                        hasFeedback
                        name='targetURL'
                        label={t('webhooks.setup.targetURL')}
                        rules={[
                            {
                                required: true,
                                message: t('webhooks.setup.targetURLRequired'),
                            },
                        ]}
                    >
                        <Input placeholder='https://example.com/postreceive' />
                    </Form.Item>
                    <Form.Item
                        name='description'
                        label={t('webhooks.setup.description')}
                    >
                        <Input />
                    </Form.Item>
                    {
                        !webhook && (
                            <Row className='ant-form-item'>
                                <Col className='ant-form-item-label' span={24}>
                                    <Text className='cvat-text-color'>{t('webhooks.setup.project')}</Text>
                                </Col>
                                <Col span={24}>
                                    <ProjectSearchField
                                        onSelect={(_projectId: number | null) => setProjectId(_projectId)}
                                        value={projectId}
                                    />
                                </Col>
                            </Row>
                        )
                    }

                    <Form.Item
                        name='contentType'
                        label={t('webhooks.setup.contentType')}
                        rules={[{ required: true }]}
                    >
                        <Select>
                            <Select.Option value={WebhookContentType.JSON}>
                                {WebhookContentType.JSON}
                            </Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name='secret'
                        label={t('webhooks.setup.secret')}
                    >
                        <Input />
                    </Form.Item>
                    <Form.Item
                        help={t('webhooks.setup.sslHelp')}
                        name='enableSSL'
                        valuePropName='checked'
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('webhooks.setup.enableSSL')}</Text>
                        </Checkbox>
                    </Form.Item>
                    <Form.Item
                        help={t('webhooks.setup.activeHelp')}
                        name='isActive'
                        valuePropName='checked'
                    >
                        <Checkbox>
                            <Text className='cvat-text-color'>{t('webhooks.setup.active')}</Text>
                        </Checkbox>
                    </Form.Item>
                    <Form.Item
                        name='eventsMethod'
                        label={t('webhooks.setup.eventScope')}
                        rules={[{
                            required: true,
                            message: t('webhooks.setup.eventsMethodRequired'),
                        }]}
                    >
                        <Radio.Group className='cvat-webhook-event-mode'>
                            <Radio
                                className='cvat-webhook-events-all-radio'
                                value={EventsMethod.SEND_EVERYTHING}
                            >
                                {t('webhooks.setup.sendAllEvents')}
                            </Radio>
                            <Radio
                                className='cvat-webhook-events-custom-radio'
                                value={EventsMethod.SELECT_INDIVIDUAL}
                            >
                                {t('webhooks.setup.customEvents')}
                            </Radio>
                        </Radio.Group>
                    </Form.Item>
                    {
                        eventsMethod === EventsMethod.SELECT_INDIVIDUAL && (
                            <div className='cvat-webhook-events-section'>
                                <Text type='secondary' className='cvat-webhook-events-help'>
                                    {t('webhooks.setup.customEventsHelp')}
                                </Text>
                                <Form.Item
                                    name='events'
                                    rules={[{
                                        validator: (_, value?: string[]) => (
                                            form.getFieldValue('eventsMethod') !== EventsMethod.SELECT_INDIVIDUAL ||
                                            value?.length ? Promise.resolve() :
                                                Promise.reject(new Error(t('webhooks.setup.selectAtLeastOneEvent')))
                                        ),
                                    }]}
                                >
                                    <CheckboxGroup className='cvat-webhook-detailed-events'>
                                        {eventGroups.map((group) => {
                                            const selectedCount = group.events.filter(({ value }) => (
                                                selectedEventSet.has(value)
                                            )).length;
                                            const allSelected = selectedCount === group.events.length;
                                            const partiallySelected = selectedCount > 0 && !allSelected;
                                            const groupClassName = `cvat-webhook-event-group${
                                                selectedCount ? ' cvat-webhook-event-group-selected' : ''
                                            }`;

                                            return (
                                                <section
                                                    className={groupClassName}
                                                    data-resource={group.resource}
                                                    key={group.resource}
                                                >
                                                    <div className='cvat-webhook-event-group-header'>
                                                        <Checkbox
                                                            skipGroup
                                                            className='cvat-webhook-event-group-select-all'
                                                            checked={allSelected}
                                                            indeterminate={partiallySelected}
                                                            onChange={(event: CheckboxChangeEvent): void => {
                                                                toggleEventGroup(group, event.target.checked);
                                                            }}
                                                        >
                                                            <Text strong className='cvat-text-color'>
                                                                {t(`webhooks.events.resources.${group.resource}`, {
                                                                    defaultValue: group.resource,
                                                                })}
                                                            </Text>
                                                            <Text
                                                                type='secondary'
                                                                className='cvat-webhook-event-group-select-all-label'
                                                            >
                                                                {t('webhooks.setup.selectAll')}
                                                            </Text>
                                                        </Checkbox>
                                                        <Text type='secondary' className='cvat-webhook-event-group-count'>
                                                            {t('webhooks.setup.selectedEventCount', {
                                                                selected: selectedCount,
                                                                total: group.events.length,
                                                            })}
                                                        </Text>
                                                    </div>
                                                    <div className='cvat-webhook-event-actions'>
                                                        {group.events.map((event) => (
                                                            <Checkbox
                                                                className='cvat-webhook-event-option'
                                                                data-event={event.value}
                                                                key={event.value}
                                                                value={event.value}
                                                            >
                                                                {t(`webhooks.events.actions.${event.action}`, {
                                                                    defaultValue: event.action,
                                                                })}
                                                            </Checkbox>
                                                        ))}
                                                    </div>
                                                </section>
                                            );
                                        })}
                                    </CheckboxGroup>
                                </Form.Item>
                            </div>
                        )
                    }
                    <Row justify='end' className='cvat-webhook-submit-row'>
                        <Col>
                            <Button
                                className='cvat-submit-webhook-button'
                                type='primary'
                                htmlType='submit'
                            >
                                {t('actions.submit')}
                            </Button>
                        </Col>
                    </Row>
                </Form>
            </Col>
        </Row>
    );
}

export default React.memo(SetupWebhookContent);
