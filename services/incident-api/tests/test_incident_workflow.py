import unittest

from fastapi.testclient import TestClient

from app.main import app


class IncidentWorkflowTest(unittest.TestCase):
    def test_health_has_explicit_response_contract(self) -> None:
        client = TestClient(app)

        response = client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_create_update_and_audit_incident(self) -> None:
        client = TestClient(app)
        payload = {
            "title": "EHR unavailable",
            "description": "The clinic cannot access the EHR",
            "type": "technology",
            "severity": "high",
            "channel": "phone",
        }

        created = client.post("/incidents", json=payload)

        self.assertEqual(created.status_code, 201)
        incident_id = created.json()["id"]

        detail = client.get(f"/incidents/{incident_id}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["id"], incident_id)

        edited = client.patch(
            f"/incidents/{incident_id}",
            json={"title": "EHR unavailable in London", "severity": "critical"},
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json()["title"], "EHR unavailable in London")
        self.assertEqual(edited.json()["severity"], "critical")

        listing = client.get("/incidents")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(
            set(listing.json()[0]),
            {
                "id",
                "title",
                "type",
                "severity",
                "status",
                "responsible_area",
                "created_at",
                "updated_at",
            },
        )
        self.assertNotIn("description", listing.json()[0])
        self.assertIn("description", detail.json())
        filtered = client.get("/incidents", params={"severity": "critical"})
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(len(filtered.json()), 1)
        summary = client.get("/incidents/summary/open-by-severity")
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(
            set(summary.json()), {"critical", "high", "medium", "low"}
        )
        self.assertEqual(summary.json()["critical"], 1)

        status_update = client.patch(
            f"/incidents/{incident_id}/status",
            json={"status": "in-progress", "changed_by": "user-1"},
        )
        area_update = client.patch(
            f"/incidents/{incident_id}/responsible-area",
            json={"responsible_area": "technology", "changed_by": "user-2"},
        )
        status_filtered = client.get(
            "/incidents", params={"status": "in-progress"}
        )
        area_filtered = client.get(
            "/incidents", params={"responsible_area": "technology"}
        )
        closed = client.patch(
            f"/incidents/{incident_id}/status",
            json={"status": "closed", "changed_by": "user-3"},
        )
        audit = client.get(f"/incidents/{incident_id}/audit")
        closed_summary = client.get("/incidents/summary/open-by-severity")

        self.assertEqual(status_update.status_code, 200)
        self.assertEqual(area_update.status_code, 200)
        self.assertEqual(len(status_filtered.json()), 1)
        self.assertEqual(len(area_filtered.json()), 1)
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.json()["status"], "closed")
        self.assertEqual(audit.status_code, 200)
        self.assertEqual(len(audit.json()), 3)
        self.assertEqual(audit.json()[0]["changed_by"], "user-1")
        self.assertEqual(audit.json()[1]["changed_by"], "user-2")
        self.assertEqual(audit.json()[2]["changed_by"], "user-3")
        self.assertIsNotNone(audit.json()[2]["changed_at"])
        self.assertEqual(closed_summary.json()["critical"], 0)


if __name__ == "__main__":
    unittest.main()