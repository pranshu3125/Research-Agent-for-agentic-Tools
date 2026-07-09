from __future__ import annotations

import json
import typing
from enum import Enum
from typing import Any, Dict, List, Optional, Union


HttpUrl = str


def Field(default: Any = None, **_: Any) -> Any:
    return default


class BaseModel:
    def __init__(self, **kwargs: Any) -> None:
        annotations = self._all_annotations()
        for field_name, annotation in annotations.items():
            value = kwargs.get(field_name, getattr(self.__class__, field_name, None))
            setattr(self, field_name, self._coerce_value(annotation, value))

    @classmethod
    def _all_annotations(cls) -> Dict[str, Any]:
        annotations: Dict[str, Any] = {}
        for base in reversed(cls.__mro__):
            try:
                annotations.update(typing.get_type_hints(base))
            except Exception:
                annotations.update(getattr(base, "__annotations__", {}))
        return annotations

    @classmethod
    def _coerce_value(cls, annotation: Any, value: Any) -> Any:
        if value is None:
            return None

        origin = getattr(annotation, "__origin__", None)
        args = getattr(annotation, "__args__", ())

        if origin in (list, List):
            subtype = args[0] if args else Any
            return [cls._coerce_value(subtype, item) for item in value]

        if origin is Union:
            non_none = [arg for arg in args if arg is not type(None)]
            if non_none:
                return cls._coerce_value(non_none[0], value)
            return value

        try:
            if isinstance(annotation, type) and issubclass(annotation, Enum):
                return value if isinstance(value, annotation) else annotation(value)
        except TypeError:
            pass

        if annotation in (int, float, str, bool):
            return annotation(value)

        return value

    def dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {}
        for field_name in self._all_annotations():
            payload[field_name] = self._serialize(getattr(self, field_name))
        return payload

    def json(self, indent: Optional[int] = None) -> str:
        return json.dumps(self.dict(), indent=indent)

    def copy(self, update: Optional[Dict[str, Any]] = None) -> "BaseModel":
        data = self.dict()
        if update:
            data.update(update)
        return self.__class__(**data)

    def _serialize(self, value: Any) -> Any:
        if isinstance(value, Enum):
            return value.value
        if isinstance(value, BaseModel):
            return value.dict()
        if isinstance(value, list):
            return [self._serialize(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize(item) for key, item in value.items()}
        return value
