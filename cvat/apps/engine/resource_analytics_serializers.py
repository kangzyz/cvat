# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from rest_framework import serializers

from cvat.apps.engine import models


class ResourceAnalyticsQuerySerializer(serializers.Serializer):
    start_date = serializers.DateTimeField(required=False)
    end_date = serializers.DateTimeField(required=False)
    bucket = serializers.ChoiceField(
        choices=("auto", "hour", "day", "week", "month"),
        default="auto",
    )
    user_id = serializers.IntegerField(required=False, min_value=1)
    refresh = serializers.BooleanField(required=False, default=False)
    page = serializers.IntegerField(required=False, min_value=1, default=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=100, default=50)
    filename = serializers.CharField(required=False, allow_blank=False, max_length=255)

    def to_internal_value(self, data):
        normalized = data.copy()
        if "from" in data:
            normalized["start_date"] = data.get("from")
        if "to" in data:
            normalized["end_date"] = data.get("to")
        return super().to_internal_value(normalized)

    def validate(self, attrs):
        if attrs.get("start_date") and attrs.get("end_date"):
            if attrs["start_date"] > attrs["end_date"]:
                raise serializers.ValidationError("'from' must be before 'to'")
        return attrs


class ResourceAnalyticsResourceSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=("project", "task", "job"))
    id = serializers.IntegerField()
    name = serializers.CharField()
    project_id = serializers.IntegerField(allow_null=True)
    task_id = serializers.IntegerField(allow_null=True)
    owner = serializers.CharField(allow_null=True)
    assignee = serializers.CharField(allow_null=True)
    organization_id = serializers.IntegerField(allow_null=True)
    created_date = serializers.DateTimeField()
    updated_date = serializers.DateTimeField()


class ResourceAnalyticsFreshnessSerializer(serializers.Serializer):
    snapshot_at = serializers.DateTimeField()
    quality_at = serializers.DateTimeField(allow_null=True)
    quality_stale = serializers.BooleanField()
    activity_configured = serializers.BooleanField()


class ResourceAnalyticsJobProgressSerializer(serializers.Serializer):
    total = serializers.IntegerField(min_value=0)
    completed = serializers.IntegerField(min_value=0)
    percent = serializers.FloatField(min_value=0, max_value=100)
    by_stage = serializers.DictField(child=serializers.IntegerField(min_value=0))
    by_state = serializers.DictField(child=serializers.IntegerField(min_value=0))


class ResourceAnalyticsJobWorkflowSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=[choice[0] for choice in models.JobType.choices()])
    stage = serializers.ChoiceField(choices=[choice[0] for choice in models.StageChoice.choices()])
    state = serializers.ChoiceField(choices=[choice[0] for choice in models.StateChoice.choices()])


class ResourceAnalyticsProgressSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("jobs", "workflow"))
    annotation_jobs = ResourceAnalyticsJobProgressSerializer(allow_null=True)
    ground_truth_jobs = serializers.IntegerField(min_value=0)
    consensus_jobs = serializers.IntegerField(min_value=0)
    job = ResourceAnalyticsJobWorkflowSerializer(allow_null=True)


class ResourceAnalyticsInventorySerializer(serializers.Serializer):
    frames = serializers.IntegerField(min_value=0)
    logical_objects = serializers.IntegerField(min_value=0)
    shapes = serializers.IntegerField(min_value=0)
    tracks = serializers.IntegerField(min_value=0)
    tags = serializers.IntegerField(min_value=0)
    intervals = serializers.IntegerField(min_value=0)
    keyframes = serializers.IntegerField(min_value=0)
    interpolated_frames = serializers.IntegerField(min_value=0)


class ResourceAnalyticsIssuesSerializer(serializers.Serializer):
    total = serializers.IntegerField(min_value=0)
    open = serializers.IntegerField(min_value=0)
    resolved = serializers.IntegerField(min_value=0)


class ResourceAnalyticsQualitySerializer(serializers.Serializer):
    available = serializers.BooleanField()
    report_id = serializers.IntegerField(allow_null=True)
    accuracy = serializers.FloatField(allow_null=True)
    precision = serializers.FloatField(allow_null=True)
    recall = serializers.FloatField(allow_null=True)
    conflicts = serializers.IntegerField(min_value=0)
    errors = serializers.IntegerField(min_value=0)
    warnings = serializers.IntegerField(min_value=0)
    validation_frames = serializers.IntegerField(min_value=0)
    total_frames = serializers.IntegerField(min_value=0)
    validation_frame_share = serializers.FloatField(allow_null=True)
    created_date = serializers.DateTimeField(allow_null=True)
    target_last_updated = serializers.DateTimeField(allow_null=True)
    stale = serializers.BooleanField()


class ResourceAnalyticsRisksSerializer(serializers.Serializer):
    unassigned_jobs = serializers.IntegerField(min_value=0)
    inactive_age_seconds = serializers.IntegerField(min_value=0)
    stage_backlog = serializers.DictField(child=serializers.IntegerField(min_value=0))
    open_issues = serializers.IntegerField(min_value=0)
    rejected_jobs = serializers.IntegerField(min_value=0)
    quality_accuracy = serializers.FloatField(allow_null=True)


class ResourceAnalyticsChildSerializer(serializers.Serializer):
    resource_type = serializers.ChoiceField(choices=("task", "job", "frame"))
    id = serializers.IntegerField()
    name = serializers.CharField()
    project_id = serializers.IntegerField(allow_null=True)
    task_id = serializers.IntegerField(allow_null=True)
    job_id = serializers.IntegerField(allow_null=True)
    job_type = serializers.CharField(allow_null=True)
    stage = serializers.CharField(allow_null=True)
    state = serializers.CharField(allow_null=True)
    assignee = serializers.CharField(allow_null=True)
    frames = serializers.IntegerField(min_value=0)
    annotation_jobs_total = serializers.IntegerField(min_value=0)
    annotation_jobs_completed = serializers.IntegerField(min_value=0)
    completion_percent = serializers.FloatField(allow_null=True)
    logical_objects = serializers.IntegerField(min_value=0)
    open_issues = serializers.IntegerField(min_value=0)
    quality_accuracy = serializers.FloatField(allow_null=True)
    issue_count = serializers.IntegerField(min_value=0)
    conflict_count = serializers.IntegerField(min_value=0)
    updated_date = serializers.DateTimeField(allow_null=True)


class ResourceAnalyticsOverviewSerializer(serializers.Serializer):
    resource = ResourceAnalyticsResourceSerializer()
    freshness = ResourceAnalyticsFreshnessSerializer()
    progress = ResourceAnalyticsProgressSerializer()
    inventory = ResourceAnalyticsInventorySerializer()
    issues = ResourceAnalyticsIssuesSerializer()
    quality = ResourceAnalyticsQualitySerializer()
    risks = ResourceAnalyticsRisksSerializer()
    children_count = serializers.IntegerField(min_value=0)
    children = ResourceAnalyticsChildSerializer(many=True)


class ResourceAnalyticsLabelSerializer(serializers.Serializer):
    label_id = serializers.IntegerField()
    label = serializers.CharField()
    shapes = serializers.IntegerField(min_value=0)
    tracks = serializers.IntegerField(min_value=0)
    tags = serializers.IntegerField(min_value=0)
    intervals = serializers.IntegerField(min_value=0)
    keyframes = serializers.IntegerField(min_value=0)
    interpolated_frames = serializers.IntegerField(min_value=0)
    total = serializers.IntegerField(min_value=0)


class ResourceAnalyticsDistributionSerializer(serializers.Serializer):
    name = serializers.CharField()
    count = serializers.IntegerField(min_value=0)


class ResourceAnalyticsFrameDensitySerializer(serializers.Serializer):
    job_id = serializers.IntegerField()
    task_id = serializers.IntegerField()
    start_frame = serializers.IntegerField(min_value=0)
    stop_frame = serializers.IntegerField(min_value=0)
    object_count = serializers.IntegerField(min_value=0)
    issue_count = serializers.IntegerField(min_value=0)
    conflict_count = serializers.IntegerField(min_value=0)


class ResourceAnalyticsAnnotationsSerializer(serializers.Serializer):
    snapshot_at = serializers.DateTimeField()
    totals = ResourceAnalyticsInventorySerializer()
    by_label = ResourceAnalyticsLabelSerializer(many=True)
    by_type = ResourceAnalyticsDistributionSerializer(many=True)
    by_source = ResourceAnalyticsDistributionSerializer(many=True)
    frame_density = ResourceAnalyticsFrameDensitySerializer(many=True)


class ResourceAnalyticsAvailabilitySerializer(serializers.Serializer):
    available = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True)
    queried_at = serializers.DateTimeField()
    max_event_at = serializers.DateTimeField(allow_null=True)


class ResourceAnalyticsRangeSerializer(serializers.Serializer):
    start_date = serializers.DateTimeField()
    end_date = serializers.DateTimeField()
    bucket = serializers.ChoiceField(choices=("hour", "day", "week", "month"))
    timezone = serializers.CharField()


class ResourceAnalyticsActivitySummarySerializer(serializers.Serializer):
    working_time_ms = serializers.IntegerField(min_value=0)
    created_objects = serializers.IntegerField(min_value=0)
    updated_objects = serializers.IntegerField(min_value=0)
    deleted_objects = serializers.IntegerField(min_value=0)
    net_objects = serializers.IntegerField()
    objects_per_active_hour = serializers.FloatField(allow_null=True, min_value=0)
    review_rejections = serializers.IntegerField(min_value=0)
    active_contributors = serializers.IntegerField(min_value=0)


class ResourceAnalyticsSeriesSerializer(ResourceAnalyticsActivitySummarySerializer):
    bucket_start = serializers.DateTimeField()


class ResourceAnalyticsContributorSerializer(ResourceAnalyticsActivitySummarySerializer):
    user_id = serializers.IntegerField(allow_null=True)
    user_name = serializers.CharField(allow_null=True)
    last_activity_at = serializers.DateTimeField(allow_null=True)


class ResourceAnalyticsTransitionSerializer(serializers.Serializer):
    job_id = serializers.IntegerField(allow_null=True)
    field = serializers.ChoiceField(choices=("stage", "state", "assignee"))
    old_value = serializers.CharField(allow_null=True)
    new_value = serializers.CharField(allow_null=True)
    timestamp = serializers.DateTimeField()
    user_id = serializers.IntegerField(allow_null=True)
    user_name = serializers.CharField(allow_null=True)


class ResourceAnalyticsWorkflowSerializer(serializers.Serializer):
    transitions = ResourceAnalyticsTransitionSerializer(many=True)
    dwell_time_by_stage = serializers.DictField(child=serializers.IntegerField(min_value=0))
    dwell_time_by_state = serializers.DictField(child=serializers.IntegerField(min_value=0))
    first_activity_at = serializers.DateTimeField(allow_null=True)
    last_activity_at = serializers.DateTimeField(allow_null=True)


class ResourceAnalyticsContributorScopeSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("all", "self", "filtered"))
    user_id = serializers.IntegerField(allow_null=True)


class ResourceAnalyticsActivitySerializer(serializers.Serializer):
    availability = ResourceAnalyticsAvailabilitySerializer()
    range = ResourceAnalyticsRangeSerializer()
    contributor_scope = ResourceAnalyticsContributorScopeSerializer()
    summary = ResourceAnalyticsActivitySummarySerializer()
    series = ResourceAnalyticsSeriesSerializer(many=True)
    contributors = ResourceAnalyticsContributorSerializer(many=True)
    workflow = ResourceAnalyticsWorkflowSerializer()


class ResourceAnalyticsEventSerializer(serializers.Serializer):
    scope = serializers.CharField()
    obj_name = serializers.CharField(allow_null=True)
    obj_id = serializers.IntegerField(allow_null=True)
    obj_val = serializers.CharField(allow_null=True)
    timestamp = serializers.DateTimeField()
    end_timestamp = serializers.DateTimeField()
    count = serializers.IntegerField(allow_null=True)
    duration = serializers.IntegerField(min_value=0)
    working_time_ms = serializers.IntegerField(min_value=0)
    created_objects = serializers.IntegerField(min_value=0)
    updated_objects = serializers.IntegerField(min_value=0)
    deleted_objects = serializers.IntegerField(min_value=0)
    project_id = serializers.IntegerField(allow_null=True)
    task_id = serializers.IntegerField(allow_null=True)
    job_id = serializers.IntegerField(allow_null=True)
    user_id = serializers.IntegerField(allow_null=True)
    user_name = serializers.CharField(allow_null=True)
    job_type = serializers.CharField(allow_null=True)
    assignee = serializers.CharField(allow_null=True)
    stage = serializers.CharField(allow_null=True)
    state = serializers.CharField(allow_null=True)
    payload = serializers.JSONField(allow_null=True)
    resource_exists = serializers.BooleanField()
    resource_name = serializers.CharField(allow_null=True)


class ResourceAnalyticsEventsSerializer(serializers.Serializer):
    availability = ResourceAnalyticsAvailabilitySerializer()
    range = ResourceAnalyticsRangeSerializer()
    contributor_scope = ResourceAnalyticsContributorScopeSerializer()
    count = serializers.IntegerField(min_value=0)
    page = serializers.IntegerField(min_value=1)
    page_size = serializers.IntegerField(min_value=1, max_value=100)
    results = ResourceAnalyticsEventSerializer(many=True)
