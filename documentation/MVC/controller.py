# controller.py
from model import UserModel
from view import UserView


class UserController:
    def __init__(self):
        self.model = UserModel()
        self.view = UserView()

    def add_user(self, name, age):
        self.model.add_user(name, age)
        self.view.show_message(f"User '{name}' added successfully!")

    def display_users(self):
        users = self.model.get_users()
        self.view.show_users(users)


# Run the MVC
if __name__ == "__main__":
    controller = UserController()

    controller.add_user("Alice", 25)
    controller.add_user("Bob", 30)

    controller.display_users()
