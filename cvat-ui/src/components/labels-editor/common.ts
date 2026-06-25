// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    SerializedLabel, SerializedAttribute, getCore, LabelType,
} from 'cvat-core-wrapper';
import i18n from 'i18n';

export interface SkeletonConfiguration {
    type: 'skeleton';
    svg: string;
    sublabels: SerializedLabel[];
}

export type LabelOptColor = SerializedLabel;

const core = getCore();
let id = 0;

function validateParsedAttribute(attr: SerializedAttribute): void {
    if (typeof attr !== 'object' || attr === null) {
        throw new Error(i18n.t('forms:validation.attributeJsonObject'));
    }

    if (typeof attr.name !== 'string') {
        throw new Error(i18n.t('forms:validation.attributeNameString'));
    }

    if (attr.name.trim().length === 0) {
        throw new Error(i18n.t('forms:validation.attributeNameNotEmpty'));
    }

    if (typeof attr.id !== 'undefined' && !Number.isInteger(attr.id)) {
        throw new Error(i18n.t('forms:validation.attributeIdInteger', { name: attr.name }));
    }

    if (!['checkbox', 'number', 'text', 'radio', 'select'].includes((attr.input_type ?? '').toLowerCase())) {
        throw new Error(i18n.t('forms:validation.unknownInputType', {
            name: attr.name,
            inputType: attr.input_type,
        }));
    }

    if (typeof attr.mutable !== 'boolean') {
        throw new Error(i18n.t('forms:validation.mutableBoolean', { name: attr.name }));
    }

    if (!Array.isArray(attr.values) || !attr.values.length) {
        throw new Error(i18n.t('forms:validation.attributeValuesArray', { name: attr.name }));
    }

    for (const value of attr.values) {
        if (typeof value !== 'string') {
            throw new Error(i18n.t('forms:validation.attributeValueString', { name: attr.name }));
        }
    }

    const attrValues = attr.values.map((value: string) => value.trim());
    if (new Set(attrValues).size !== attrValues.length) {
        throw new Error(i18n.t('forms:validation.attributeValuesUnique', { name: attr.name }));
    }

    if (attr.default_value) {
        if (!core.utils.validateAttributeValue(attr.default_value, new core.classes.Attribute(attr))) {
            throw new Error(i18n.t('forms:validation.invalidDefaultValue', {
                name: attr.name,
                value: attr.default_value,
            }));
        }
    }
}

export function validateParsedLabel(label: SerializedLabel): void {
    if (typeof label !== 'object' || label === null) {
        throw new Error(i18n.t('forms:validation.labelJsonObject'));
    }

    if (typeof label.name !== 'string') {
        throw new Error(i18n.t('forms:validation.labelNameString'));
    }

    if (label.name.trim().length === 0) {
        throw new Error(i18n.t('forms:validation.labelNameNotEmpty'));
    }

    if (typeof label.id !== 'undefined' && !Number.isInteger(label.id)) {
        throw new Error(i18n.t('forms:validation.labelIdInteger', { name: label.name }));
    }

    if (label.color && typeof label.color !== 'string') {
        throw new Error(i18n.t('forms:validation.labelColorString', { name: label.name }));
    }

    if (label.color && !label.color.match(/^#[0-9a-fA-F]{6}$|^$/)) {
        throw new Error(i18n.t('forms:validation.labelColorInvalid', { name: label.name }));
    }

    if (!Array.isArray(label.attributes)) {
        throw new Error(i18n.t('forms:validation.labelAttributesArray', { name: label.name }));
    }

    for (const attr of label.attributes) {
        validateParsedAttribute(attr);
    }

    const attrNames = label.attributes.map((attr: SerializedAttribute) => attr.name.trim());
    if (new Set(attrNames).size !== attrNames.length) {
        throw new Error(i18n.t('forms:validation.labelAttributeNamesUnique', { name: label.name }));
    }

    if (!Object.values(LabelType).includes(label.type)) {
        throw new Error(i18n.t('forms:validation.unknownLabelType', { name: label.name, type: label.type }));
    }

    if (label.type === LabelType.SKELETON) {
        if (!Array.isArray(label.sublabels) || label.sublabels.length === 0) {
            throw new Error(i18n.t('forms:validation.skeletonNeedsSublabels', { name: label.name }));
        }

        for (const sublabel of label.sublabels) {
            validateParsedLabel(sublabel);
        }

        const sublabelsNames = label.sublabels.map((sublabel: SerializedLabel) => sublabel.name.trim());
        if (new Set(sublabelsNames).size !== sublabelsNames.length) {
            throw new Error(i18n.t('forms:validation.sublabelNamesUnique', { name: label.name }));
        }

        if (typeof label.svg !== 'string') {
            throw new Error(i18n.t('forms:validation.skeletonNeedsSvg', { name: label.name }));
        }

        const sublabelIds = label.sublabels
            .map((sublabel: SerializedLabel) => sublabel.id)
            .filter((sublabelId: number | undefined) => sublabelId !== undefined);
        const matches = label.svg.matchAll(/data-label-id="([\d]+)"/g);
        for (const match of matches) {
            const refersToId = +match[1];
            if (!sublabelIds.includes(refersToId)) {
                throw new Error(i18n.t('forms:validation.skeletonSvgMissingSublabel', {
                    name: label.name,
                    id: refersToId,
                }));
            }
        }
    }
}

export function idGenerator(): number {
    return --id;
}

export function equalArrayHead(arr1: string[], arr2: string[]): boolean {
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }

    return true;
}

export function toSVGCoord(svg: SVGSVGElement, coord: number[], raiseError = false): number[] {
    const result = [];
    const ctm = svg.getScreenCTM();

    if (!ctm) {
        if (raiseError) throw new Error(i18n.t('forms:validation.screenCtmNull'));
        return coord;
    }

    const inversed = ctm.inverse();
    if (!inversed) {
        if (raiseError) throw new Error(i18n.t('forms:validation.inversedScreenCtmNull'));
        return coord;
    }

    for (let i = 0; i < coord.length; i += 2) {
        let point = svg.createSVGPoint();
        point.x = coord[i];
        point.y = coord[i + 1];
        point = point.matrixTransform(inversed);
        result.push(point.x, point.y);
    }

    return result;
}

export function fromSVGCoord(svg: SVGSVGElement, coord: number[], raiseError = false): number[] {
    const result = [];
    const ctm = svg.getScreenCTM();
    if (!ctm) {
        if (raiseError) throw new Error(i18n.t('forms:validation.inversedScreenCtmNull'));
        return coord;
    }

    for (let i = 0; i < coord.length; i += 2) {
        let point = svg.createSVGPoint();
        point.x = coord[i];
        point.y = coord[i + 1];
        point = point.matrixTransform(ctm);
        result.push(point.x, point.y);
    }

    return result;
}
