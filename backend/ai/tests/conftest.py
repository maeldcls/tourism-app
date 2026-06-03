import sys
import numpy as np
from unittest.mock import MagicMock

# Mock sentence-transformers at import time so the 90MB model is never downloaded in CI.
# main.py does `from sentence_transformers import SentenceTransformer` at module level,
# so this patch must happen before main.py is first imported.
_mock_model_instance = MagicMock()
_mock_model_instance.encode.return_value = np.ones(384, dtype=np.float32)

_mock_st = MagicMock()
_mock_st.SentenceTransformer.return_value = _mock_model_instance
sys.modules["sentence_transformers"] = _mock_st
