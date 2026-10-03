from app.chat_filter import check, clean

OK = [
    "привет всем", "Кто хочет сыграть дуэль?", "я набрал 1500 очков", "потребляет много энергии",
    "хлеб алла", "мандарин вкусный", "сегодня хорошая погода.", "ребята, го играть", "оскорбление не ок",
    "ура, 3.5 тысячи!", "собака и скрипка", "Ну и херня.", "мы пи здесь",
]
BAD_WORDS = ["ты хуй", "пизда", "х у й", "х.у.й", "xуй", "хууууй", "п и з д е ц", "ебать", "заебал", "блядь", "сука", "ПИДОР", "пошёл на хуй"]
BAD_LINKS = [
    "зайди на vk.com/club1", "http://a.b", "https://example.org/x", "www.site.ru", "site.ru", "site . ru",
    "сайт точка ру", "t.me/abc", "пиши @durov", "my-site[.]com", "vk.cc/abc",
]


def test_clean_messages_pass():
    for t in OK:
        assert check(clean(t)) is None, t


def test_obscene_words_are_blocked():
    for t in BAD_WORDS:
        assert check(clean(t)) == "words", t


def test_links_are_blocked():
    for t in BAD_LINKS:
        assert check(clean(t)) == "link", t


def test_empty_and_long():
    assert check(clean("   ")) == "empty"
    assert check(clean(123)) == "empty"
    assert len(clean("а" * 500)) == 200
