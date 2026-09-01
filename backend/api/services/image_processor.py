"""Factory de traitement d'image partagée.

Avant : le pipeline PIL (ouverture, correction de la rotation EXIF, suppression
des métadonnées, redimensionnement, sauvegarde JPEG) était dupliqué presque à
l'identique entre routes/profile.py (_save_avatar) et routes/monument_photos.py
(_save_and_process), avec juste un recadrage carré en plus côté avatar.

ImageProcessor centralise ce pipeline : chaque appelant instancie un processor
paramétré pour son usage (dossier, dimension, qualité, recadrage carré ou non)
et n'a plus qu'à appeler process_and_save().
"""
import os
import uuid
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps


class ImageProcessor:
    def __init__(self, upload_dir: str, max_dimension: int, jpeg_quality: int, square_crop: bool = False):
        self.upload_dir = upload_dir
        self.max_dimension = max_dimension
        self.jpeg_quality = jpeg_quality
        self.square_crop = square_crop
        os.makedirs(upload_dir, exist_ok=True)

    def process_and_save(self, file_bytes: bytes) -> str:
        """Traite l'image reçue et l'enregistre en JPEG. Retourne le nom de fichier généré."""
        try:
            img = Image.open(BytesIO(file_bytes))
            img = ImageOps.exif_transpose(img)
            img = img.convert("RGB")
        except Exception:
            raise HTTPException(status_code=400, detail="Fichier image invalide")

        if self.square_crop:
            w, h = img.size
            side = min(w, h)
            left, top = (w - side) // 2, (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
            img = img.resize((self.max_dimension, self.max_dimension))
        else:
            img.thumbnail((self.max_dimension, self.max_dimension))

        filename = f"{uuid.uuid4().hex}.jpg"
        img.save(os.path.join(self.upload_dir, filename), "JPEG", quality=self.jpeg_quality)
        return filename
