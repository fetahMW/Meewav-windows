"""Read-only patch statistics; never modifies the reference or the capture."""
import json
import sys
from PIL import Image, ImageFilter
import numpy as np

regions = {
    'dark_pvc': (650, 530, 800, 625),
    'left_reflection': (210, 560, 285, 615),
    'right_reflection': (1300, 300, 1400, 390),
}
for path in sys.argv[1:]:
    image = Image.open(path).convert('L')
    original = np.asarray(image, dtype=float)
    low = np.asarray(image.filter(ImageFilter.GaussianBlur(1.2)), dtype=float)
    results = {}
    for label, (x0, y0, x1, y1) in regions.items():
        patch = original[y0:y1, x0:x1]
        residual = patch - low[y0:y1, x0:x1]
        results[label] = {'mean': round(float(patch.mean()), 2),
            'fine_detail_std': round(float(residual.std()), 2),
            'percentiles': np.percentile(patch, [5, 50, 95]).round(1).tolist()}
    print(json.dumps({'path': path, 'size': image.size, 'patches': results}))
