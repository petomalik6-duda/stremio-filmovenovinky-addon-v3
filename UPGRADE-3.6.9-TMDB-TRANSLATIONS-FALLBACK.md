# 3.6.9 – TMDB translations + factual description fallback

After 3.6.8, remaining poor metadata records had valid posters and backgrounds but no narrative description.

3.6.9 keeps the existing cs-CZ → en-US fallback, then queries TMDB `/translations` and prefers SK/CZ/English, then the original language. If TMDB has no usable synopsis in any translation, it builds a factual, non-fictional metadata summary from the localized title, year, genres, director and cast. It never invents plot text.

`/stats` adds `tmdbTranslationFallback` and `tmdbFactualSummaryFallback`.
