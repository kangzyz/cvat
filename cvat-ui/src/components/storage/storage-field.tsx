// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from 'antd/lib/select';
import Form from 'antd/lib/form';

import { StorageData, StorageLocation } from 'cvat-core-wrapper';

const { Option } = Select;

export interface Props {
    locationName: string[];
    locationValue: StorageLocation;
    onChangeLocationValue?: (value: StorageLocation) => void;
    onChangeStorage?: (value: StorageData) => void;
}

export default function StorageField(props: Props): JSX.Element {
    const {
        locationName,
        locationValue,
        onChangeStorage,
        onChangeLocationValue,
    } = props;
    const [storageType, setStorageType] = useState('');
    const { t } = useTranslation('forms');

    useEffect(() => {
        setStorageType(locationName[0].replace('Storage', '-storage'));
    }, [locationName]);

    useEffect(() => {
        if (locationValue !== StorageLocation.LOCAL && onChangeLocationValue) {
            onChangeLocationValue(StorageLocation.LOCAL);
        }
    }, [locationValue, onChangeLocationValue]);

    useEffect(() => {
        if (onChangeStorage) {
            onChangeStorage({
                location: StorageLocation.LOCAL,
                cloudStorageId: undefined,
            });
        }
    }, [onChangeStorage]);

    return (
        <>
            <Form.Item name={locationName}>
                <Select
                    virtual={false}
                    onChange={(location: StorageLocation) => {
                        if (onChangeLocationValue) onChangeLocationValue(location);
                    }}
                    onClear={() => {
                        if (onChangeLocationValue) onChangeLocationValue(StorageLocation.LOCAL);
                    }}
                    allowClear
                    className={`cvat-select-${storageType}`}
                >
                    <Option
                        value={StorageLocation.LOCAL}
                        key={`${storageType}-${StorageLocation.LOCAL.toLowerCase()}`}
                        className={`cvat-select-${storageType}-location`}
                    >
                        {t('options.local')}
                    </Option>
                </Select>
            </Form.Item>
        </>
    );
}
