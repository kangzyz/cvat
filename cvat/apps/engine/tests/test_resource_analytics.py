# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

from django.contrib.auth.models import User
from django.test import RequestFactory, TestCase
from rest_framework.exceptions import PermissionDenied

from cvat.apps.engine import models
from cvat.apps.engine.resource_analytics import (
    build_annotations,
    build_overview,
    contributor_user_filter,
)
from cvat.apps.organizations.models import Membership, Organization


class ResourceAnalyticsSnapshotTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username="analytics-owner")
        cls.worker = User.objects.create_user(username="analytics-worker")
        cls.data = models.Data.objects.create(size=10, stop_frame=9, image_quality=70)
        cls.task = models.Task.objects.create(
            name="analytics-task",
            owner=cls.owner,
            data=cls.data,
            segment_size=10,
        )
        cls.segment = models.Segment.objects.create(
            task=cls.task,
            start_frame=0,
            stop_frame=9,
        )
        cls.annotation_job = models.Job.objects.create(
            segment=cls.segment,
            type=models.JobType.ANNOTATION.value,
            stage=models.StageChoice.ACCEPTANCE.value,
            state=models.StateChoice.COMPLETED.value,
        )
        cls.gt_segment = models.Segment.objects.create(
            task=cls.task,
            start_frame=0,
            stop_frame=9,
        )
        cls.gt_job = models.Job.objects.create(
            segment=cls.gt_segment,
            type=models.JobType.GROUND_TRUTH.value,
        )
        cls.label = models.Label.objects.create(task=cls.task, name="vehicle")

        models.LabeledShape.objects.create(
            job=cls.annotation_job,
            label=cls.label,
            frame=0,
            type=models.ShapeType.RECTANGLE.value,
            points=[0, 0, 10, 10],
        )
        models.LabeledShape.objects.create(
            job=cls.gt_job,
            label=cls.label,
            frame=0,
            type=models.ShapeType.RECTANGLE.value,
            points=[0, 0, 10, 10],
        )

    def test_task_completion_and_inventory_only_use_ordinary_jobs(self):
        overview = build_overview(self.task)

        self.assertEqual(overview["progress"]["annotation_jobs"]["total"], 1)
        self.assertEqual(overview["progress"]["annotation_jobs"]["completed"], 1)
        self.assertEqual(overview["progress"]["ground_truth_jobs"], 1)
        self.assertEqual(overview["inventory"]["logical_objects"], 1)
        self.assertEqual(overview["inventory"]["shapes"], 1)

        children = {child["id"]: child for child in overview["children"]}
        self.assertEqual(children[self.annotation_job.id]["logical_objects"], 1)
        self.assertEqual(children[self.gt_job.id]["logical_objects"], 1)

    def test_job_uses_workflow_instead_of_synthetic_completion(self):
        overview = build_overview(self.annotation_job)

        self.assertEqual(overview["progress"]["mode"], "workflow")
        self.assertIsNone(overview["progress"]["annotation_jobs"])
        self.assertEqual(overview["progress"]["job"]["stage"], "acceptance")
        self.assertNotIn("percent", overview["progress"]["job"])

    def test_track_keyframes_and_interpolation_are_separate_from_logical_objects(self):
        track = models.LabeledTrack.objects.create(
            job=self.annotation_job,
            label=self.label,
            frame=0,
        )
        models.TrackedShape.objects.create(
            track=track,
            frame=0,
            type=models.ShapeType.RECTANGLE.value,
            points=[0, 0, 10, 10],
            outside=False,
        )
        models.TrackedShape.objects.create(
            track=track,
            frame=5,
            type=models.ShapeType.RECTANGLE.value,
            points=[0, 0, 10, 10],
            outside=True,
        )

        annotations = build_annotations(self.task)

        self.assertEqual(annotations["totals"]["logical_objects"], 2)
        self.assertEqual(annotations["totals"]["tracks"], 1)
        self.assertEqual(annotations["totals"]["keyframes"], 1)
        self.assertEqual(annotations["totals"]["interpolated_frames"], 4)


class ResourceAnalyticsContributorScopeTest(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="scope-owner")
        self.worker = User.objects.create_user(username="scope-worker")
        self.factory = RequestFactory()

    def request_for(self, user):
        request = self.factory.get("/api/projects/1/analytics/activity")
        request.user = user
        return request

    def test_sandbox_owner_has_full_scope_and_worker_is_self_only(self):
        project = models.Project.objects.create(name="sandbox-project", owner=self.owner)

        self.assertEqual(
            contributor_user_filter(self.request_for(self.owner), project, None),
            (None, {"mode": "all", "user_id": None}),
        )
        self.assertEqual(
            contributor_user_filter(self.request_for(self.worker), project, None),
            (self.worker.id, {"mode": "self", "user_id": self.worker.id}),
        )
        with self.assertRaises(PermissionDenied):
            contributor_user_filter(self.request_for(self.worker), project, self.owner.id)

    def test_organization_supervisor_has_full_contributor_scope(self):
        organization = Organization.objects.create(slug="analytics-org", owner=self.owner)
        Membership.objects.create(
            organization=organization,
            user=self.worker,
            role=Membership.SUPERVISOR,
            is_active=True,
        )
        project = models.Project.objects.create(
            name="organization-project",
            owner=self.owner,
            organization=organization,
        )

        self.assertEqual(
            contributor_user_filter(self.request_for(self.worker), project, None),
            (None, {"mode": "all", "user_id": None}),
        )
