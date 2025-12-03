<div id="cb-auth-container" style="max-width:900px; margin:40px auto;">
  <h1 style="margin-bottom:24px;">Личный кабинет</h1>

  <!-- Две колонки: слева регистрация, справа вход -->
  <div style="display:flex; gap:24px; align-items:flex-start; flex-wrap:wrap;">

    <!-- Регистрация -->
    <div id="cb-register-block"
         style="flex:1 1 320px; padding:20px; border:1px solid #ddd; border-radius:8px;">
      <h3>Регистрация</h3>

      <input id="cb-reg-firstname" type="text" placeholder="Имя"
             style="width:100%; margin-bottom:8px;" />
      <input id="cb-reg-lastname" type="text" placeholder="Фамилия"
             style="width:100%; margin-bottom:8px;" />
      <input id="cb-reg-class" type="number" placeholder="Класс"
             style="width:100%; margin-bottom:8px;" />

      <input id="cb-reg-login" type="text" placeholder="Логин"
             style="width:100%; margin-bottom:8px;" />
      <input id="cb-reg-password" type="password" placeholder="Пароль"
             style="width:100%; margin-bottom:8px;" />

      <button id="cb-register-btn" style="width:100%; margin-top:10px;">
        Зарегистрироваться
      </button>

      <div id="cb-reg-message" style="margin-top:10px; color:red;"></div>
    </div>

    <!-- Вход -->
    <div id="cb-login-block"
         style="flex:1 1 320px; padding:20px; border:1px solid #ddd; border-radius:8px;">
      <h3>Вход</h3>

      <input id="cb-login-login" type="text" placeholder="Логин"
             style="width:100%; margin-bottom:8px;" />
      <input id="cb-login-password" type="password" placeholder="Пароль"
             style="width:100%; margin-bottom:8px;" />

      <button id="cb-login-btn" style="width:100%; margin-top:10px;">
        Войти
      </button>

      <div id="cb-login-message" style="margin-top:10px; color:red;"></div>
    </div>

  </div>

  <!-- ЛИЧНЫЙ КАБИНЕТ (показывается после входа/регистрации) -->
  <div id="cb-lk-block"
       style="display:none; margin-top:24px; padding:20px; border:1px solid #ddd; border-radius:8px;">
    <h3>Личный кабинет</h3>

    <p><b>Имя:</b> <span id="cb-lk-firstname"></span></p>
    <p><b>Фамилия:</b> <span id="cb-lk-lastname"></span></p>
    <p><b>Логин:</b> <span id="cb-lk-login"></span></p>
    <p><b>Public ID:</b> <span id="cb-lk-publicid"></span></p>
    <p><b>Класс:</b> <span id="cb-lk-class"></span></p>

    <button id="cb-logout-btn" style="width:100%; margin-top:20px;">
      Выйти
    </button>
  </div>
</div>

<div id="cb-lk-sessions">
  <!-- сюда скрипт будет подставлять текст со статистикой -->
</div>
