import numpy as np
from rasterio.transform import Affine

from pipelines.constants import DEFAULT_CRS
from pipelines.infra.data_types.loaded_data_types import RasterData
from pipelines.infra.utils.exposure import (
    _crop_to_hazard_bounds,
    compute_population_exposed,
)


class TestCropToHazardBounds:
    def test_crops_population_to_hazard_extent(self):
        pop_array = np.ones((100, 100), dtype=np.float32) * 10.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 1.0)

        hazard_array = np.ones((10, 10), dtype=np.float32) * 5.0
        hazard_transform = Affine(0.01, 0, 0.3, 0, -0.01, 0.7)

        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        cropped, _ = _crop_to_hazard_bounds(
            pop_array, pop_transform, hazard_raster, DEFAULT_CRS
        )

        assert cropped.shape[0] <= pop_array.shape[0]
        assert cropped.shape[1] <= pop_array.shape[1]
        assert cropped.shape == (10, 10)

    def test_fallback_when_hazard_outside_population(self):
        pop_array = np.ones((50, 50), dtype=np.float32) * 10.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 0.5)

        hazard_array = np.ones((5, 5), dtype=np.float32) * 5.0
        hazard_transform = Affine(0.01, 0, 10.0, 0, -0.01, 10.0)

        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        cropped, _ = _crop_to_hazard_bounds(
            pop_array, pop_transform, hazard_raster, DEFAULT_CRS
        )

        assert cropped.shape == pop_array.shape

    def test_full_overlap_returns_full_array(self):
        pop_array = np.ones((20, 20), dtype=np.float32) * 10.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 0.2)

        hazard_array = np.ones((20, 20), dtype=np.float32) * 5.0
        hazard_transform = pop_transform

        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        cropped, _ = _crop_to_hazard_bounds(
            pop_array, pop_transform, hazard_raster, DEFAULT_CRS
        )

        assert cropped.shape == pop_array.shape


class TestComputePopulationExposedWithCrop:
    def test_only_hazard_pixels_count_as_exposed(self):
        pop_array = np.ones((100, 100), dtype=np.float32) * 50.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 1.0)
        population_raster = RasterData(
            array=pop_array,
            transform=pop_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        hazard_array = np.zeros((10, 10), dtype=np.float32)
        hazard_array[3:7, 3:7] = 1.0
        hazard_transform = Affine(0.01, 0, 0.3, 0, -0.01, 0.7)
        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        result = compute_population_exposed(population_raster, hazard_raster)

        assert result is not None
        assert result.array.shape[0] <= pop_array.shape[0]
        assert result.array.shape[1] <= pop_array.shape[1]

        total_exposed = result.array.sum()
        total_if_full_country = pop_array.sum()
        assert total_exposed < total_if_full_country
        assert total_exposed > 0

    def test_no_hazard_means_no_exposure(self):
        pop_array = np.ones((50, 50), dtype=np.float32) * 100.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 0.5)
        population_raster = RasterData(
            array=pop_array,
            transform=pop_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        hazard_array = np.zeros((10, 10), dtype=np.float32)
        hazard_transform = Affine(0.01, 0, 0.1, 0, -0.01, 0.4)
        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        result = compute_population_exposed(population_raster, hazard_raster)

        assert result is not None
        assert result.array.sum() == 0.0

    def test_result_matches_original_for_full_overlap(self):
        pop_array = np.ones((20, 20), dtype=np.float32) * 25.0
        pop_transform = Affine(0.01, 0, 0.0, 0, -0.01, 0.2)
        population_raster = RasterData(
            array=pop_array,
            transform=pop_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        hazard_array = np.ones((20, 20), dtype=np.float32)
        hazard_transform = pop_transform
        hazard_raster = RasterData(
            array=hazard_array,
            transform=hazard_transform,
            crs=DEFAULT_CRS,
            nodata=-9999.0,
        )

        result = compute_population_exposed(population_raster, hazard_raster)

        assert result is not None
        np.testing.assert_allclose(result.array.sum(), pop_array.sum(), rtol=0.01)
