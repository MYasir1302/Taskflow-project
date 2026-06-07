(function () {
  const { auth, ui, managers, events } = window.TaskFlow;
  const utils = window.TaskFlow.utils;
  const currentUser = auth.requireAuth("settings.html");
  if (!currentUser) return;

  const pageContent = document.getElementById("page-content");

  function syncCurrentUser() {
    const latestUser = auth.requireAuth("settings.html");
    if (!latestUser) return null;
    Object.assign(currentUser, latestUser);
    return currentUser;
  }

  function render() {
    ui.renderShell({
      currentUser,
      activeNav: "settings",
      title: "Settings",
      subtitle: "Update your profile details used across the workspace.",
    });

    pageContent.innerHTML = `
      <section class="settings-stack settings-single-column">
        <section class="card">
          <div class="card-header">
            <div>
              <h3>Profile Settings</h3>
              <p>Update your display details used across the workspace.</p>
            </div>
          </div>
          <form id="settings-profile-form" class="grid">
            <div class="form-grid">
              <div class="form-group">
                <label>Name</label>
                <input name="name" value="${utils.escapeHtml(currentUser.name)}" required />
              </div>
              <div class="form-group">
                <label>Email</label>
                <input name="email" type="email" value="${utils.escapeHtml(currentUser.email)}" required />
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" type="submit">Save Profile</button>
            </div>
          </form>
        </section>

        <section class="card">
          <div class="card-header">
            <div>
              <h3>Password Settings</h3>
              <p>Change your login password for this workspace.</p>
            </div>
          </div>
          <form id="settings-password-form" class="grid">
            <div class="form-grid">
              <div class="form-group">
                <label>Current Password</label>
                <input name="currentPassword" type="password" required />
              </div>
              <div class="form-group">
                <label>New Password</label>
                <input name="newPassword" type="password" required />
              </div>
              <div class="form-group full">
                <label>Confirm New Password</label>
                <input name="confirmPassword" type="password" required />
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-primary" type="submit">Update Password</button>
            </div>
          </form>
        </section>
      </section>
    `;

    const profileForm = document.getElementById("settings-profile-form");
    if (profileForm) {
      profileForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(profileForm);
        TaskFlow.forms.setFormBusy(profileForm, true, "Saving...");

        managers.user
          .updateOwnProfile(
            currentUser.id,
            {
              name: formData.get("name"),
              email: formData.get("email"),
            },
            currentUser
          )
          .then(function () {
            ui.showToast("Profile updated successfully.", "success");
            render();
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update profile.", "error");
          })
          .finally(function () {
            TaskFlow.forms.setFormBusy(profileForm, false);
            ui.hidePageLoader();
          });
      });
    }

    const passwordForm = document.getElementById("settings-password-form");
    if (passwordForm) {
      passwordForm.addEventListener("submit", function (event) {
        event.preventDefault();
        const formData = new FormData(passwordForm);
        const currentPassword = String(formData.get("currentPassword") || "");
        const newPassword = String(formData.get("newPassword") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");

        if (newPassword.length < 4) {
          ui.showToast("New password must be at least 4 characters.", "error");
          return;
        }

        if (newPassword !== confirmPassword) {
          ui.showToast("New password and confirm password do not match.", "error");
          return;
        }

        TaskFlow.forms.setFormBusy(passwordForm, true, "Saving...");

        managers.user
          .updateOwnPassword(currentUser.id, currentPassword, newPassword, currentUser)
          .then(function () {
            passwordForm.reset();
            ui.showToast("Password updated successfully.", "success");
          })
          .catch(function (error) {
            ui.showToast(error.message || "Unable to update password.", "error");
          })
          .finally(function () {
            TaskFlow.forms.setFormBusy(passwordForm, false);
            ui.hidePageLoader();
          });
      });
    }
  }

  render();
  events.on("db:updated", function () {
    if (!syncCurrentUser()) return;
    render();
  });
  events.on("preferences:updated", function () {
    render();
  });
  events.on("session:updated", function () {
    syncCurrentUser();
  });
})();
