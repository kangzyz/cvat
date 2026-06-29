# Copyright (C) CVAT.ai Corporation
#
# SPDX-License-Identifier: MIT

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("engine", "0107_frame_extraction"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="source_frame_extraction",
            field=models.ForeignKey(
                blank=True,
                default=None,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="tasks",
                related_query_name="task",
                to="engine.frameextractionsession",
            ),
        ),
    ]
