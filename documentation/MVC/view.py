# view.py
class UserView:
    def __init__(self):
          pass # good for a breakpoint

    @staticmethod
    def show_users(users):
        print("\nUser List:")
        for user in users:
            print(f"Name: {user.name}, Age: {user.age}")

    @staticmethod
    def show_message(message):
        print(message)