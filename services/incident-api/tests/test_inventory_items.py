import unittest

from fastapi.testclient import TestClient

from app.inventory_router import inventory_store
from app.main import app


class InventoryItemApiTest(unittest.TestCase):
    def setUp(self) -> None:
        inventory_store.clear()
        self.client = TestClient(app)
        self.payload = {
            "clinic_location": "Austin Central",
            "country": "us",
            "name": "Nitrile gloves",
            "category": "ppe",
            "unit_of_measure": "box",
            "reorder_point": 12,
        }

    def test_inv_001_and_011_item_crud_by_clinic(self) -> None:
        created = self.client.post("/inventory/items", json=self.payload)
        self.assertEqual(created.status_code, 201)
        self.assertNotIn("available_stock", created.json())
        item_id = created.json()["id"]

        second = self.client.post(
            "/inventory/items",
            json={**self.payload, "clinic_location": "London City", "country": "uk"},
        )
        self.assertEqual(second.status_code, 201)

        detail = self.client.get(f"/inventory/items/{item_id}")
        listing = self.client.get(
            "/inventory/items", params={"clinic_location": "Austin Central"}
        )
        updated = self.client.patch(
            f"/inventory/items/{item_id}", json={"reorder_point": 20}
        )

        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(listing.json()), 1)
        self.assertEqual(
            set(listing.json()[0]),
            {
                "id",
                "clinic_location",
                "name",
                "category",
                "reorder_point",
                "available_stock",
                "below_reorder",
            },
        )
        self.assertNotIn("country", listing.json()[0])
        self.assertEqual(detail.json()["country"], "us")
        self.assertIn("available_stock", listing.json()[0])
        self.assertIn("below_reorder", listing.json()[0])
        self.assertEqual(updated.json()["reorder_point"], 20)

        deleted = self.client.delete(f"/inventory/items/{item_id}")
        missing = self.client.get(f"/inventory/items/{item_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(missing.status_code, 404)


if __name__ == "__main__":
    unittest.main()